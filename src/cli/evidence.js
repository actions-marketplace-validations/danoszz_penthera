/**
 * `penthera evidence verify <dir> [--allowed-signers <file>] [--json]`
 *
 * Recomputes every artifact hash in an evidence bundle and checks the SSH
 * signature over manifest.json. Exit 0 when the bundle verifies, 1 when it
 * does not, 2 on a usage error.
 */
import { parseArgs } from "node:util";
import { verifyEvidence } from "../report/evidence.js";

const HELP = `
  penthera evidence verify <dir> [--allowed-signers <file>] [--json]

  Recomputes the SHA-256 of every file in an evidence bundle (written with
  --evidence <dir>), fails on any changed, missing or extra file, and checks
  manifest.json.sig with ssh-keygen against the allowed signers file.

  Exit codes: 0 verified, 1 verification failed, 2 usage error.
  See docs/evidence.md.
`;

export function runEvidence(argv, { out = process.stdout } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "allowed-signers": { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`  ${e.message}\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help || positionals[0] !== "verify" || positionals.length !== 2) {
    (values.help ? out : process.stderr).write(HELP);
    return values.help ? 0 : 2;
  }

  const r = verifyEvidence(positionals[1], { allowedSigners: values["allowed-signers"] || null });
  if (values.json) {
    const { manifest, ...rest } = r;
    out.write(JSON.stringify({ ...rest, target: manifest?.target || null, generated_at: manifest?.generated_at || null }, null, 2) + "\n");
    return r.ok ? 0 : 1;
  }

  const m = r.manifest;
  if (m) {
    out.write(`\n  Bundle     ${positionals[1]}\n`);
    out.write(`  Target     ${m.target}\n`);
    out.write(`  Generated  ${m.generated_at} by penthera ${m.tool?.version}\n`);
    if (m.git) out.write(`  Git        ${m.git.commit}${m.git.dirty ? " (uncommitted changes)" : ""}\n`);
    out.write("\n");
  }
  for (const f of r.files) out.write(`  ${f.ok ? "ok  " : "FAIL"}  ${f.path}${f.ok ? "" : `  (${f.reason})`}\n`);
  for (const p of r.unlisted) out.write(`  FAIL  ${p}  (not in manifest)\n`);
  if (r.signature) {
    const label = r.signature.ok ? (r.signature.status === "valid" ? "ok  " : "warn") : "FAIL";
    out.write(`  ${label}  signature: ${r.signature.detail}\n`);
  }
  out.write(r.ok ? "\n  Verified: every artifact matches the manifest.\n\n" : `\n  NOT VERIFIED:\n${r.problems.map((p) => `    - ${p}\n`).join("")}\n`);
  return r.ok ? 0 : 1;
}
