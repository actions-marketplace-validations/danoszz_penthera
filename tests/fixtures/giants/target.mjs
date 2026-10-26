/**
 * The small project the --giants fixtures were recorded on: one hit for each
 * area (secrets, code, dependencies, infrastructure). It is written to a temp
 * folder by the tests and by scripts/giants/record.mjs, never checked in, so
 * this repository holds no live-looking secret. The secrets are built from
 * parts for the same reason.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// Not real keys: made-up values with the right shape.
const GITHUB_TOKEN = ["ghp", "_", "Zq8rT2", "vLm4Xw9", "Kp3Nd7Hs", "Fj6Bc1Gt5", "Ry0Ae"].join("");
const API_KEY = ["4f9c2e7a", "b81d6f30", "c5e9a2d4", "71b8e6f0"].join("");
const AWS_KEY_ID = ["AKIA", "QX7R2M", "5TNB6W3Z", "KD"].join("");
const AWS_SECRET = ["k3Rt9vWq", "2Lx8Zp4N", "m7Yc1Hs6", "Gf0Bd5Jw", "Qa9Ue3Tv"].join("");

export const TARGET_SECRETS = { GITHUB_TOKEN, API_KEY, AWS_KEY_ID, AWS_SECRET };

export const TARGET_FILES = {
  "config.js": [
    "// Settings for the demo service.",
    `export const githubToken = "${GITHUB_TOKEN}";`,
    `export const api_key = "${API_KEY}";`,
    "",
    "export const aws = {",
    `  aws_access_key_id: "${AWS_KEY_ID}",`,
    `  aws_secret_access_key: "${AWS_SECRET}",`,
    "};",
    "",
  ].join("\n"),
  "server.js": [
    "import express from \"express\";",
    "import { exec } from \"node:child_process\";",
    "",
    "const app = express();",
    "app.get(\"/run\", (req, res) => {",
    "  exec(\"ls \" + req.query.dir, (err, out) => res.send(out));",
    "});",
    "app.get(\"/calc\", (req, res) => {",
    "  res.send(String(eval(req.query.expr)));",
    "});",
    "app.listen(3000);",
    "",
  ].join("\n"),
  "package.json": JSON.stringify({ name: "giants-target", version: "1.0.0", private: true, dependencies: { express: "4.17.1", lodash: "4.17.15" } }, null, 2) + "\n",
  "package-lock.json": JSON.stringify({
    name: "giants-target", version: "1.0.0", lockfileVersion: 3, requires: true,
    packages: {
      "": { name: "giants-target", version: "1.0.0", dependencies: { express: "4.17.1", lodash: "4.17.15" } },
      "node_modules/express": { version: "4.17.1", resolved: "https://registry.npmjs.org/express/-/express-4.17.1.tgz" },
      "node_modules/lodash": { version: "4.17.15", resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz" },
    },
  }, null, 2) + "\n",
  "requirements.txt": "requests==2.19.0\nflask==0.12.2\n",
  "Dockerfile": [
    "FROM node:14",
    "WORKDIR /app",
    "COPY . .",
    "RUN npm install",
    "EXPOSE 3000",
    "CMD [\"node\", \"server.js\"]",
    "",
  ].join("\n"),
  "infra/main.tf": [
    "resource \"aws_s3_bucket\" \"logs\" {",
    "  bucket = \"giants-target-logs\"",
    "  acl    = \"public-read\"",
    "}",
    "",
    "resource \"aws_security_group\" \"web\" {",
    "  name = \"web\"",
    "  ingress {",
    "    from_port   = 22",
    "    to_port     = 22",
    "    protocol    = \"tcp\"",
    "    cidr_blocks = [\"0.0.0.0/0\"]",
    "  }",
    "}",
    "",
  ].join("\n"),
};

/** Write the target project into `dir` (created if missing). Returns `dir`. */
export function writeTarget(dir) {
  for (const [rel, text] of Object.entries(TARGET_FILES)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return dir;
}
