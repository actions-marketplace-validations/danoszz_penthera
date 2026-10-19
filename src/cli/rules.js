/**
 * `penthera rules list|verify <dir>`, and loading `--rules <dir>` packs for a scan.
 * Rule packs are data, verified before use; see docs/rule-packs.md.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { bold, dim, green, red, yellow } from "./ansi.js";

const HELP = `
${bold("penthera rules")}: signed, versioned detection rule packs (offline)

  penthera rules list [--rules <dir>]...        Packs in effect: bundled, plus any given
  penthera rules verify <dir> [--rules-signers <file>] [--json]
                                                Check a pack: signature, file hashes,
                                                schema, ReDoS guard. Exit 0 only if it
                                                would load without --allow-unsigned-rules.

  Add packs to a scan with --rules <dir> (repeatable). There is no download
  command: packs arrive by path or by upgrading Penthera.
`;

const kindsSummary = (rules) => Object.entries(rules || {}).filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.length}`).join(", ");

/**
 * Verify and activate --rules packs. Throws with a user-facing message on refusal.
 * @returns {string[]} warnings to print
 */
export async function activateRules(opts) {
  const dirs = [].concat(opts.rules || []);
  if (dirs.length === 0) return [];
  const { addRulePack, loadSigners } = await import("../../lib/rules/index.js");
  const signers = loadSigners([].concat(opts["rules-signers"] || []).map((f) => resolve(f)));
  const warnings = [];
  for (const d of dirs) {
    const r = addRulePack(resolve(d), { signers, allowUnsigned: !!opts["allow-unsigned-rules"] });
    warnings.push(...r.warnings);
  }
  return warnings;
}

/** Print warnings from activateRules to stderr; unsigned-pack warnings are loud on purpose. */
export function printRuleWarnings(warnings) {
  for (const w of warnings) {
    if (w.startsWith("LOADING AN UNTRUSTED")) {
      process.stderr.write(`\n  ${red(bold("!! WARNING !!"))} ${bold(w)}\n\n`);
    } else {
      process.stderr.write(`  ${yellow("warn")} rules: ${w}\n`);
    }
  }
}

export async function runRules(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        rules: { type: "string", multiple: true },
        "rules-signers": { type: "string", multiple: true },
        "allow-unsigned-rules": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    console.error(`  ${red("error")} ${e.message}`);
    return 2;
  }
  const { values: opts, positionals } = parsed;
  const [cmd, ...rest] = positionals;
  if (opts.help || !cmd) {
    console.log(HELP);
    return opts.help ? 0 : 2;
  }

  const rules = await import("../../lib/rules/index.js");
  let signers;
  try {
    signers = rules.loadSigners([].concat(opts["rules-signers"] || []).map((f) => resolve(f)));
  } catch (e) {
    console.error(`  ${red("error")} ${e.message}`);
    return 2;
  }

  if (cmd === "verify") {
    if (rest.length !== 1) {
      console.error(`  ${red("error")} usage: penthera rules verify <dir>`);
      return 2;
    }
    const v = rules.verifyPack(rest[0], { signers });
    const trusted = v.ok && v.signature === "valid";
    if (opts.json) {
      const { rules: compiled, manifest, ...out } = v;
      console.log(JSON.stringify({ ...out, trusted, kinds: Object.fromEntries(Object.entries(compiled || {}).map(([k, x]) => [k, x.length])) }, null, 2));
      return trusted ? 0 : 1;
    }
    console.log(`\n  ${bold("Rule pack")} ${v.name ? `${v.name}@${v.version}` : rest[0]}  ${dim(v.dir)}`);
    const sigLine = v.signature === "valid" ? green(`valid, signed by ${v.signer}`)
      : v.signature === "invalid" ? red(`INVALID: ${v.signatureError}`)
      : yellow("missing (no pack.json.sig)");
    console.log(`  signature   ${sigLine}`);
    if (v.ok) {
      console.log(`  files       ${green("all SHA-256 hashes match pack.json")}`);
      console.log(`  rules       ${green(`${v.count} valid`)} ${dim(`(${kindsSummary(v.rules)})`)}`);
      console.log(`  regexes     ${green("all pass the ReDoS guard")}`);
    }
    for (const e of v.errors) console.log(`  ${red("error")}       ${e}`);
    for (const w of v.warnings) console.log(`  ${yellow("warn")}        ${w}`);
    console.log(trusted
      ? `\n  ${green("OK")}: this pack loads with --rules ${rest[0]}\n`
      : v.ok
        ? `\n  ${yellow("NOT TRUSTED")}: well-formed, but it only loads with --allow-unsigned-rules.${rules.bundledPackDirs().includes(v.dir) ? " (Bundled packs load as part of the release; npm run rules:check refuses to publish them unsigned.)" : ""}\n`
        : `\n  ${red("REFUSED")}: this pack does not load, with or without --allow-unsigned-rules.\n`);
    return trusted ? 0 : 1;
  }

  if (cmd === "list") {
    try {
      printRuleWarnings(await activateRules({ ...opts, rules: opts.rules }));
    } catch (e) {
      console.error(`  ${red("error")} ${e.message}`);
      return 1;
    }
    const packs = rules.activePacks();
    if (opts.json) {
      console.log(JSON.stringify(packs, null, 2));
      return 0;
    }
    console.log(`\n  ${bold("Rule packs in effect")}\n`);
    for (const p of packs) {
      const sig = p.signature === "valid" ? green(`signed by ${p.signer}`)
        : p.origin === "bundled" ? yellow(`${p.signature === "invalid" ? "signature invalid" : "unsigned"} (bundled; release check requires a signature)`)
        : red("UNSIGNED (--allow-unsigned-rules)");
      console.log(`  ${bold(`${p.name}@${p.version}`)}  ${dim(p.origin)}  ${p.count} rules  ${sig}`);
      console.log(`    ${dim(p.dir)}`);
    }
    console.log("");
    return 0;
  }

  console.error(`  ${red("error")} unknown rules command "${cmd}" (list, verify)`);
  return 2;
}
