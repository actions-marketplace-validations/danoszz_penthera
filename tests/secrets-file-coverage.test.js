/**
 * E11b pass 1: secret-scan file coverage and three precision fixes.
 * - Key files, PHP, C#, Java/server configs and Terraform state are read.
 * - .txt and .md are read with the fixed-shape rules only.
 * - An extensionless file is read when it starts with a private-key header.
 * - A private key needs its base64 body; a header alone is not a key.
 * - A value that is only the key's name, and AWS's documented example key,
 *   are placeholders.
 * Fixtures are our own, written to a temp dir at runtime.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { scanSecrets, isSecretScanTarget, isShapesOnlyFile, secretRulesFor, findSecretsInText } from "../lib/whitebox/secrets.js";

// Split so Penthera's own self-scan does not report its test fixtures.
const j = (...p) => p.join("");
const BODY = "MIIEowIBAAKCAQEAfakeTestKeyBodyForPentheraUnitTestsOnly0123456789";
const RSA = j("-----BEGIN RSA ", "PRIVATE KEY-----\n", BODY, "\nAbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AbCdEfGhIjKlMnOp\n-----END RSA ", "PRIVATE KEY-----\n");
const PW = j("pass", "word");

function scanFiles(files) {
  const dir = mkdtempSync(join(tmpdir(), "penthera-coverage-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, dirname(name)), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    return scanSecrets(dir).map((f) => `${f.url}: ${f.title}`).sort();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const names = (text, opts) => findSecretsInText(text, opts).map((h) => h.name);

describe("secret scan file coverage", () => {
  it("reads key files, PHP, C#, configs and Terraform state", () => {
    for (const f of ["certs/server.pem", "tls.key", "AuthKey.p8", "putty.ppk", "config.php", "Program.cs", "app.properties", "nginx.conf", "web.xml", "terraform.tfstate"]) {
      expect(isSecretScanTarget(f), f).toBe(true);
    }
  });

  it("finds a key in a .pem and a .key file", () => {
    expect(scanFiles({ "certs/server.pem": RSA, "tls.key": RSA })).toEqual(["certs/server.pem: Private key block in source", "tls.key: Private key block in source"]);
  });

  it("finds a password in .conf, .properties and .cs files", () => {
    const hits = scanFiles({
      "app.conf": `db.${PW}="Wq7-kz9pL"\n`,
      "app.properties": `jdbc.${PW}: "Wq7-kz9pL"\n`,
      "Db.cs": `var cfg = new Cfg { ${PW[0].toUpperCase() + PW.slice(1)} = "Wq7-kz9pL" };\n`,
    });
    expect(hits).toEqual(["Db.cs: Hardcoded password in source", "app.conf: Hardcoded password in source", "app.properties: Hardcoded password in source"]);
  });

  it("runs only the fixed-shape rules in .txt and .md", () => {
    expect(isShapesOnlyFile("docs/setup.md")).toBe(true);
    expect(isShapesOnlyFile("src/app.js")).toBe(false);
    const doc = `Log in with ${PW} = "Wq7-kz9pL".\n\n${RSA}`;
    expect(scanFiles({ "README.md": doc, "notes.txt": doc })).toEqual(["README.md: Private key block in source", "notes.txt: Private key block in source"]);
  });

  it("secretRulesFor says which rules run on a file", () => {
    expect(secretRulesFor("src/app.js")).toBe("all");
    expect(secretRulesFor("docs/setup.md")).toBe("shapes");
    expect(secretRulesFor("deploy/id_rsa", RSA.slice(0, 256))).toBe("shapes");
    expect(secretRulesFor("deploy/LICENSE", "MIT License")).toBe(null);
    expect(secretRulesFor("node_modules/x/id_rsa", RSA.slice(0, 256))).toBe(null);
    expect(secretRulesFor("logo.png")).toBe(null);
  });

  it("reads an extensionless file that starts with a key header, and no other", () => {
    expect(scanFiles({ "deploy/id_rsa": RSA, "deploy/LICENSE": `${PW} = "Wq7-kz9pL"\n` })).toEqual(["deploy/id_rsa: Private key block in source"]);
  });
});

describe("private keys need a body", () => {
  it("matches a PEM key with real, escaped or commented newlines", () => {
    expect(names(RSA)).toEqual(["Private key block"]);
    expect(names(RSA.replace(/\n/g, "\\n"))).toEqual(["Private key block"]);
    expect(names(RSA.split("\n").map((l) => `# ${l}`).join("\n"))).toEqual(["Private key block"]);
    const enc = j("-----BEGIN RSA ", "PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,0A1B2C3D\n\n", BODY, "\n");
    expect(names(enc)).toEqual(["Private key block"]);
  });

  it("matches a service-account private_key with its body", () => {
    const json = `{ "private_key": "${j("-----BEGIN ", "PRIVATE KEY-----\\n", BODY, "\\n-----END ", "PRIVATE KEY-----\\n")}" }`;
    expect(names(json)).toEqual(["GCP/Firebase service account"]);
  });

  it("does not match a header with no body: an elided example or a list of headers", () => {
    expect(names(`"private_key": "${j("-----BEGIN RSA ", "PRIVATE KEY-----...-----END RSA ", "PRIVATE KEY-----")}"`)).toEqual([]);
    expect(names(j(" * Reads keys with these headers:\n * -----BEGIN EC ", "PRIVATE KEY-----\n * -----BEGIN EC PARAMETERS-----\n"))).toEqual([]);
  });
});

describe("placeholders", () => {
  it("skips a value that is only the key's name", () => {
    expect(names(`var expected${PW[0].toUpperCase() + PW.slice(1)} = "${PW}";`)).toEqual([]);
    expect(names(`api_key = "api_key"`)).toEqual([]);
    expect(names(`${PW} = "${PW}123!"`)).toEqual(["Hardcoded password"]);
  });

  it("skips AWS's documented example access key, not other keys", () => {
    expect(names(j("aws_access_key_id = AKIA", "IOSFODNN7EXAMPLE"))).toEqual([]);
    expect(names(j("aws_access_key_id = AKIA", "Z3MXQ7HPLR2VKW4N"))).toEqual(["AWS access key"]);
  });
});

describe("every hit is listed", () => {
  it("one finding per rule and file, with every hit's line", async () => {
    const { formatSarif } = await import("../src/reporter.js");
    const dir = mkdtempSync(join(tmpdir(), "penthera-lines-"));
    try {
      const line = `db_${PW} = "Wq7-kz9pL-Hq2v"\n`;
      writeFileSync(join(dir, "settings.py"), `${line}x = 1\n${line}${line}`);
      const findings = scanSecrets(dir);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ line: 1, lines: [1, 3, 4] });
      expect(findings[0].description).toMatch(/Also on lines 3, 4\.$/);
      const [result] = formatSarif({ target: dir, mode: "repo", findings }).runs[0].results;
      expect(result.locations[0].physicalLocation.region.startLine).toBe(1);
      expect(result.relatedLocations.map((l) => l.physicalLocation.region.startLine)).toEqual([3, 4]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a single hit has no lines list", () => {
    const dir = mkdtempSync(join(tmpdir(), "penthera-lines-"));
    try {
      writeFileSync(join(dir, "settings.py"), `db_${PW} = "Wq7-kz9pL-Hq2v"\n`);
      const [f] = scanSecrets(dir);
      expect(f.lines).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
