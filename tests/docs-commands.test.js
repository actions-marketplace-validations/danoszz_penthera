import { describe, it, expect } from "vitest";
import {
  extractCommands, splitCommands, stripComment, parsePenthera, classify, helpModel, checkDocs, report,
} from "../scripts/docs-commands.mjs";

// A help model from canned help text, so the classifier tests don't spawn.
const HELP = {
  "--help": `
    $ penthera init [--yes] [--dry-run]
    $ penthera <url>
    $ penthera agents [path]
    $ penthera deps [path]
    $ penthera memory show|verify|forget
    $ penthera ui [--open] [--demo]
    $ penthera install <pkg...>
        --repo <path>  -r, --repo
    -o, --output <file>
        --base <git-ref>
        --online
        --home
        --recon
    -h, --help`,
  "init --help": "penthera init  -y, --yes  --dry-run",
  "memory --help": "$ penthera memory show [--repo <path>]\n$ penthera memory verify\n$ penthera memory forget [--all]\n$ penthera memory suppress <id> --reason <text>",
  "ui --help": "$ penthera ui --demo --open --port <n>",
  "install --help": "$ penthera install <pkg>  --dry-run --yes --offline",
};
const model = helpModel((argv) => HELP[argv.join(" ")] ?? "");
const cls = (line, file = "docs/x.md") => classify(parsePenthera(splitCommands(line)[0].tokens).argv, model, { file });

describe("extracting commands from Markdown", () => {
  it("reads bash blocks, joins continuations, skips comments and reads yaml run: lines", () => {
    const md = [
      "Run `penthera deps` or `npx penthera agents --home`. Not `penthera.lock` or `penthera/fix-x`.",
      "```bash",
      "# a comment",
      "$ penthera --repo . \\",
      "  -o reports/scan.json   # write JSON",
      "npm run bench",
      "```",
      "```yaml",
      "- run: npx penthera deps --base origin/main",
      "```",
      "```json",
      '{"penthera": "not a command"}',
      "```",
    ].join("\n");
    const got = extractCommands(md, "x.md").map((c) => [c.source, c.line, c.text]);
    expect(got).toEqual([
      ["inline", 1, "penthera deps"],
      ["inline", 1, "npx penthera agents --home"],
      ["block", 4, "penthera --repo . -o reports/scan.json   # write JSON"],
      ["block", 6, "npm run bench"],
      ["yaml", 9, "npx penthera deps --base origin/main"],
    ]);
  });

  it("splits && and pipes outside quotes, and strips trailing comments", () => {
    expect(stripComment(`penthera --org "A # B" # note`)).toBe(`penthera --org "A # B"`);
    const parts = splitCommands(`penthera --cra-init c.json && penthera --cra c.json | tee "a|b"`);
    expect(parts.map((p) => p.tokens)).toEqual([["penthera", "--cra-init", "c.json"], ["penthera", "--cra", "c.json"], ["tee", "a|b"]]);
    expect(parts[2].pipedFrom).toBe(true);
    expect(parsePenthera(["PENTHERA_BEARER=x", "npx", "--no-install", "penthera@1.7.0", "deps", ">", "out.txt"]))
      .toEqual({ env: ["PENTHERA_BEARER=x"], argv: ["deps"] });
    expect(parsePenthera(["npm", "test"])).toBeNull();
  });
});

describe("checking a command against --help", () => {
  it("fails a flag the help does not list", () => {
    expect(cls("penthera deps --nope").problems).toEqual(["--nope is not in `penthera deps --help`"]);
    expect(cls("penthera ui --demo --nope").problems).toEqual(["--nope is not in `penthera ui --help`"]);
    expect(cls("penthera --repo . --dashboard").problems).toEqual(["--dashboard is not in `penthera --help`"]);
  });

  it("fails an unknown subcommand or action", () => {
    expect(cls("penthera ship").problems).toEqual(['unknown subcommand "ship"']);
    expect(cls("penthera memory explode").problems).toEqual(['unknown action "memory explode"']);
    expect(cls("penthera memory show|verify").problems).toEqual([]);
  });

  it("reports a planning document's unknown commands as planned, not failed", () => {
    expect(cls("penthera ship", "docs/plan.md").kind).toBe("planned");
    expect(cls("penthera ship", "docs/commands/x.md").kind).toBe("runnable");
  });

  it("classifies by what the command needs", () => {
    expect(cls("penthera https://myapp.com --repo .").kind).toBe("external");
    expect(cls("penthera install left-pad").kind).toBe("external");
    expect(cls("penthera deps --online").kind).toBe("external");
    expect(cls("penthera https://x.example --recon").kind).toBe("external");
    expect(cls("penthera memory forget --all").kind).toBe("runnable");
    expect(cls("penthera <url> --repo .")).toMatchObject({ kind: "placeholder", reason: "placeholder <url>" });
    expect(cls("penthera http://localhost:3000 --repo .").kind).toBe("placeholder");
    expect(cls("penthera").kind).toBe("placeholder");
    expect(cls("penthera init").kind).toBe("placeholder");
    expect(cls("penthera ui --demo").kind).toBe("placeholder");
    expect(cls("penthera deps --base")).toMatchObject({ kind: "placeholder", reason: "names --base without its value" });
    expect(cls("penthera init --yes --dry-run").kind).toBe("runnable");
    expect(cls("penthera deps --base origin/main -o reports/deps.json").kind).toBe("runnable");
  });
});

describe("the docs in this repo", () => {
  it("show only commands and flags that exist, and the offline ones run", async () => {
    const res = await checkDocs();
    const text = report(res);
    // A readable failure: the report table lists file:line, command and problem.
    expect(res.failures, text).toEqual([]);
    expect(res.results.filter((r) => r.run).length).toBeGreaterThan(50);
    expect(res.results.every((r) => ["runnable", "placeholder", "external", "other", "planned"].includes(r.kind))).toBe(true);
  });
});
