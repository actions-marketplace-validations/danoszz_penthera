/**
 * lib/tls.js: EC keys whose private scalar is tiny (the eMudhra flaw, Mozilla
 * bug 2083449). Unit checks on keys, the two real revoked eMudhra
 * intermediates (public certificates from crt.sh), and an end-to-end
 * handshake with a local server whose key is deliberately weak.
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import tls from "node:tls";
import { X509Certificate, generateKeyPairSync } from "node:crypto";
import { smallPrivateScalar, checkTls } from "../lib/tls.js";
import { ecKeyPair, selfSignedCert } from "./fixtures/tls/cert.js";

const FX = join(import.meta.dirname, "fixtures", "tls");

describe("smallPrivateScalar", () => {
  it("finds scalars below the limit on P-256 and P-384", () => {
    for (const k of [1, 2, 200, 255, 1023]) {
      expect(smallPrivateScalar(ecKeyPair("P-384", k).publicKey), `P-384 k=${k}`).toBe(k);
      expect(smallPrivateScalar(ecKeyPair("P-256", k).publicKey), `P-256 k=${k}`).toBe(k);
    }
  });

  it("ignores random EC keys, scalars at the limit, and non-EC keys", () => {
    expect(smallPrivateScalar(ecKeyPair("P-384").publicKey)).toBeNull();
    expect(smallPrivateScalar(ecKeyPair("P-256").publicKey)).toBeNull();
    expect(smallPrivateScalar(ecKeyPair("P-384", 1024).publicKey)).toBeNull();
    expect(smallPrivateScalar(generateKeyPairSync("ed25519").publicKey)).toBeNull();
    expect(smallPrivateScalar(null)).toBeNull();
  });

  it("flags the real eMudhra G3B and G3C intermediates", () => {
    for (const f of ["emudhra-em-dv-tls-ca-g3b.crt", "emudhra-em-dv-tls-ca-g3c.crt"]) {
      const x = new X509Certificate(readFileSync(join(FX, f)));
      expect(x.subject).toMatch(/EM DV TLS CA - G3[BC]/);
      expect(smallPrivateScalar(x.publicKey), f).not.toBeNull();
    }
  });
});

describe("checkTls end to end", () => {
  const servers = [];
  afterAll(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));
  const serve = (opts) => new Promise((resolve) => {
    const s = tls.createServer(selfSignedCert(opts), (sock) => sock.end());
    servers.push(s);
    s.listen(0, "127.0.0.1", () => resolve(s.address().port));
  });

  it("reports a server certificate whose private key is tiny, without printing it", async () => {
    const port = await serve({ cn: "weak.test", scalar: 200 });
    const r = await checkTls("localhost", port);
    const f = r.findings.find((x) => /private key anyone can compute/.test(x.title));
    expect(f).toMatchObject({ severity: "critical", title: "TLS certificate has a private key anyone can compute" });
    expect(f.description).toMatch(/P-384 public key of the certificate for weak\.test is k·G/);
    expect(f.description).not.toMatch(/\b200\b/);
  });

  it("stays quiet for an ordinary key", async () => {
    const port = await serve({ cn: "fine.test" });
    const r = await checkTls("localhost", port);
    expect(r.subject).toBe("fine.test");
    expect(r.findings.some((x) => /anyone can compute/.test(x.title))).toBe(false);
  });
});
