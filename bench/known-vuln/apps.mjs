/**
 * How the E10 runner starts each known-vulnerable app.
 *
 * Images are pinned by digest (the same digest as in the app's truth.json).
 * `runnable: false` apps have an answer key but no scripted start yet; the
 * runner lists them and skips them.
 *
 * The runner does not log in to any app. Answer-key entries marked
 * needsAuth are outside the recall denominator of every run it makes;
 * authenticated runs are an open decision in the E10 draft.
 */

export const RELAY_IMAGE = "alpine/socat@sha256:beb4a68d9e4fe6b0f21ea774a0fde6c31f580dde6368939ed70100c5385b015e";

export const APPS = {
  "juice-shop": {
    runnable: true,
    image: "bkimminich/juice-shop@sha256:cea5a4af4aacee498c491491af0408934ec81d004035c0a02ef3e54395e3bf27",
    port: 3000,
    readyPath: "/",
    readyTimeoutMs: 180_000,
  },
  dvna: {
    runnable: true,
    image: "appsecco/dvna@sha256:2657051b73ac8f879d3a3b419b4618d98e4596a0fe27f8e91582c403541ef1b0",
    platform: "linux/amd64",
    port: 9090,
    readyPath: "/login",
    readyTimeoutMs: 240_000,
  },
  webgoat: {
    runnable: true,
    image: "webgoat/webgoat@sha256:95c23e70502d0e0e11a826a73889e2ca93f965171202c17c0c59353ba67be86a",
    port: 8080,
    readyPath: "/WebGoat/login",
    readyTimeoutMs: 300_000,
  },
  nodegoat: { runnable: false, reason: "Built from source with a MongoDB container; start not scripted yet." },
  dvwa: { runnable: false, reason: "Needs a MariaDB container and a database setup step; start not scripted yet." },
  crapi: { runnable: false, reason: "Seven services plus databases under Docker Compose; start not scripted yet." },
};

/** The runs the runner knows. None of them logs in. */
export const RUNS = {
  standard: { profile: "standard", payloads: false, auth: false, label: "standard (no attack payloads)" },
  deep: { profile: "deep", payloads: true, auth: false, label: "deep (injection probes and fuzzing)" },
};
