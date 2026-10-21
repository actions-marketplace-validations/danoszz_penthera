/** Every string the check writes into the page. Voice: docs/voice.md. */

const inputList = (names) => (names.length > 3 ? `${names.length} files` : names.length === 2 ? names.join(" and ") : names.join(", ").replace(/, ([^,]*)$/, " and $1"));
export const COPY = {
  severity: { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" },
  run: "Check files",
  running: "Checking…",
  remove: (path) => `Remove ${path}`,
  empty: "Add a file to start. It stays in this tab: nothing is uploaded.",
  // `inputs` are the staged names: files, or "response headers".
  summary: (n, inputs, ms) => `${n} finding${n === 1 ? "" : "s"} in ${inputList(inputs)}, in ${ms} ms, in this tab.`,
  clean: (inputs) => `No findings in ${inputList(inputs)}. These rules found nothing; that is not the same as safe. The full scan reads more: npx penthera.`,
  unknownName: (name) => `${name} is not a file this check reads. Rename it, or paste it and pick the file type.`,
  tooLarge: (name) => `${name} is over 1 MB, which is more than this check reads. Run npx penthera on your machine for large files.`,
  unreadable: (name) => `Could not read ${name} as text. Check that it is a text file and try again.`,
  pasteEmpty: "Paste some text first.",
  headersEmpty: "Paste the headers curl printed first.",
  backport: "This is from the version number alone. Check on the server: distributions backport fixes under the same version number.",
  replaced: (path) => `Replaced the earlier ${path}.`,
  added: (path) => `Added ${path}.`,
  exampleLoaded: "Loaded an example: a deliberately unsafe .mcp.json, .claude/settings.json and AGENTS.md from Penthera's test fixtures.",
  failed: (msg) => `The check stopped: ${msg}. Reload the page and try again; if it happens again, open an issue on GitHub.`,
  copied: "Copied",
  copy: "Copy",
  details: { file: "File", rule: "Rule", cves: "CVE", confidence: "How sure", todo: "What to do:" },
};
