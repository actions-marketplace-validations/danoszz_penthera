import { describe, it, expect } from "vitest";
import { probeBundleSecrets } from "../lib/blackbox/bundle-secrets.js";
import { createEgressContext, runWithEgress } from "../src/utils/http.js";
import { startMockServer, FAKE_BUNDLE_KEY as KEY } from "./fixtures/mock-server.js";

const ORIGIN = "http://app.test";
const OTHER_KEY = KEY.slice(0, -1) + "Z";
const notFound = () => new Response("", { status: 404 });
const js = (key) => `window.env = { KEY: "${key}" };`;
const home = (...srcs) => ({
  [ORIGIN]: () => new Response(srcs.map((s) => `<script src="${s}"></script>`).join("")),
});

// maps url to mock responses tracks requests and handles redirects when requested
function fakeWeb(routes) {
  const asked = [];
  const fetchUrl = async (url, opts = {}) => {
    asked.push(url);
    const res = (routes[url] ?? notFound)();
    const next = res.headers.get("location");
    if (opts.redirect === "follow" && next) return fetchUrl(next, opts);
    Object.defineProperty(res, "url", { value: url }); // what fetch reports after following redirects
    return res;
  };
  return { fetchUrl, asked };
}

describe("probeBundleSecrets", () => {
  it("reports a masked key in a same-origin bundle", async () => {
    const { fetchUrl } = fakeWeb({ ...home("/app.js"), [`${ORIGIN}/app.js`]: () => new Response(js(KEY)) });
    const findings = await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(findings).toMatchObject([
      { title: "Anthropic API key in client bundle", url: `${ORIGIN}/app.js`, category: "secrets", source: "bundle-scan" },
    ]);
    expect(JSON.stringify(findings)).not.toContain(KEY);
  });

  it("never requests a script from another origin", async () => {
    const { fetchUrl, asked } = fakeWeb({
      ...home("https://cdn.example/x.js", "//cdn.example/y.js", "http://app.test:9999/z.js", "/local.js"),
      [`${ORIGIN}/local.js`]: () => new Response("console.log('safe')"),
    });
    await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(asked).toEqual([ORIGIN, `${ORIGIN}/local.js`]);
  });

  it("does not follow a redirect off the target", async () => {
    const { fetchUrl, asked } = fakeWeb({
      ...home("/app.js"),
      [`${ORIGIN}/app.js`]: () => new Response(null, { status: 302, headers: { location: "https://evil.example/app.js" } }),
      "https://evil.example/app.js": () => new Response(js(KEY)),
    });
    expect(await probeBundleSecrets(ORIGIN, { fetchUrl })).toEqual([]);
    expect(asked).not.toContain("https://evil.example/app.js");
  });

  it("reports one finding per rule and script", async () => {
    const { fetchUrl } = fakeWeb({
      ...home("/a.js", "/b.js"),
      [`${ORIGIN}/a.js`]: () => new Response(js(KEY) + js(OTHER_KEY)),
      [`${ORIGIN}/b.js`]: () => new Response(js(KEY)),
    });
    const findings = await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(findings.map((f) => f.url)).toEqual([`${ORIGIN}/a.js`, `${ORIGIN}/b.js`]);
  });

  it("stops at the script limit", async () => {
    const { fetchUrl, asked } = fakeWeb(home("/1.js", "/2.js", "/3.js"));
    await probeBundleSecrets(ORIGIN, { fetchUrl, maxScripts: 2 });
    expect(asked).toEqual([ORIGIN, `${ORIGIN}/1.js`, `${ORIGIN}/2.js`]);
  });

  it("does not scan a script over the size limit", async () => {
    const { fetchUrl } = fakeWeb({
      ...home("/app.js"),
      [`${ORIGIN}/app.js`]: () => new Response(js(KEY) + " ".repeat(500)),
    });
    expect(await probeBundleSecrets(ORIGIN, { fetchUrl, maxBytes: 100 })).toEqual([]);
  });

  it("requests a script listed twice only once", async () => {
    const { fetchUrl, asked } = fakeWeb({
      ...home("/app.js", "/app.js"),
      [`${ORIGIN}/app.js`]: () => new Response(js(KEY)),
    });
    const findings = await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(asked).toEqual([ORIGIN, `${ORIGIN}/app.js`]);
    expect(findings).toHaveLength(1);
  });

  it("does not read a page over the size limit", async () => {
    const { fetchUrl, asked } = fakeWeb({
      [ORIGIN]: () => new Response('<script src="/app.js"></script>' + " ".repeat(500)),
      [`${ORIGIN}/app.js`]: () => new Response(js(KEY)),
    });
    expect(await probeBundleSecrets(ORIGIN, { fetchUrl, maxBytes: 100 })).toEqual([]);
    expect(asked).toEqual([ORIGIN]);
  });

  it("finds the key served by the mock server, using the real HTTP client", async () => {
    const mock = await startMockServer(0);
    try {
      const findings = await runWithEgress(createEgressContext({ target: mock.url }), () =>
        probeBundleSecrets(`${mock.url}/bundle-demo`),
      );
      expect(findings).toMatchObject([
        { title: "Anthropic API key in client bundle", url: `${mock.url}/bundle-demo/app.js`, source: "bundle-scan" },
      ]);
      expect(JSON.stringify(findings)).not.toContain(KEY);
    } finally {
      await mock.close();
    }
  });

  it("follows the home page to its https or www twin, and reads that origin's scripts", async () => {
    const www = "https://www.app.test";
    const { fetchUrl, asked } = fakeWeb({
      [ORIGIN]: () => new Response("", { status: 301, headers: { location: `${www}/` } }),
      [`${www}/`]: () => new Response('<script src="/app.js"></script>'),
      [`${www}/app.js`]: () => new Response(js(KEY)),
    });
    const findings = await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(findings.map((f) => f.url)).toEqual([`${www}/app.js`]);
    expect(asked).toContain(`${www}/app.js`);
  });

  it("reports a Google key next to Firebase config at low, and a lone one as found", async () => {
    // Built at run time, so no key-shaped string sits in the repository.
    const google = "AI" + "za" + "SyDq7Lm2Pz9Rt4Vb8Nc3Wd6Yf1Gh5Jk0MsX";
    const firebase = `const firebaseConfig = { apiKey: "${google}", authDomain: "demo.firebaseapp.com", projectId: "demo" };`;
    const { fetchUrl } = fakeWeb({
      ...home("/fb.js", "/ai.js"),
      [`${ORIGIN}/fb.js`]: () => new Response(firebase),
      [`${ORIGIN}/ai.js`]: () => new Response(`const gemini = "${google}";`),
    });
    const findings = await probeBundleSecrets(ORIGIN, { fetchUrl });
    expect(findings).toMatchObject([
      { url: `${ORIGIN}/fb.js`, severity: "low", title: "Likely Firebase web key in client bundle" },
      { url: `${ORIGIN}/ai.js`, severity: "high", title: "Google API key (Gemini / Firebase / Maps) in client bundle" },
    ]);
  });
});
