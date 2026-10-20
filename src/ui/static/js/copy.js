// Every user-facing sentence in one place, so the voice can be read and
// proofed as a whole. Rules: sentence case, "::" as connective, no
// exclamation marks, verbs first on buttons, empty states name the action
// that fills them, errors give the cause then the fix.

export const TAGLINE = "Open-source security for the apps and AI systems you ship"; // README headline

export const START = {
  title: "Welcome",
  intro: "No reports yet. Start with a scan of something you own :: your localhost, a preview URL, or this repo. Results land in the reports folder and this view fills in.",
  gate: "Only scan apps you own or have written permission to test.",
  steps: [
    { kind: "scan", title: "Scan your app", body: "TLS, headers, cookies, CORS, auth, exposed APIs and leaked secrets." },
    { kind: "deps", title: "Check your dependencies", body: "What every npm and Python package can do: install scripts, shell, network, obfuscated code." },
    { kind: "agents", title: "Audit your AI tooling", body: "Skills, MCP servers, hooks and rule files: hidden instructions, unpinned servers, wide permissions." },
  ],
  demo: "To look around first, stop this server and run",
};

export const KINDS = [
  { kind: "scan", label: "Scan", title: "Scan a site or folder", button: "Scan" },
  { kind: "deps", label: "Deps", title: "Check dependencies", button: "Check dependencies" },
  { kind: "agents", label: "AI tooling", title: "Audit AI tooling", button: "Audit AI tooling" },
  { kind: "loop", label: "Fix loop", title: "Run the fix loop", button: "Run the fix loop" },
];

export const NOTES = {
  scan: "Contacts only the URL's host while offline is on. A folder-only scan contacts nothing.",
  deps: "Reads lockfiles and installed packages. No network.",
  agents: "Read-only. No network.",
  loop: "Offline, on a local branch. Every diff waits for you. Nothing is pushed.",
};

export const EMPTY = {
  projects: "No projects yet. Run a scan to add one.",
  runs: "No runs yet.",
  findings: "No open findings in the latest scan.",
  filtered: "Nothing matches the filter. Press Esc to clear it.",
  deps: "No dependency report yet. Choose Scan ▸ Check dependencies in the menu bar.",
  ai: "No AI tooling report yet. Choose Scan ▸ Audit AI tooling in the menu bar.",
  inspector: "Pick a finding to read it here in plain words, with its evidence and the fix.",
  history: "No runs for this project yet.",
  evidence: "No bundles yet. Create one from the latest scan.",
  memory: "No memory yet. The fix loop and scans with --memory write it.",
  changes: "No fixes applied yet. Run the fix loop to apply one.",
};

export const ERR = {
  session: "The session ended. Restart penthera ui and open the new one-time link it prints.",
};

export const KEYS = [
  ["n", "new scan"], ["/", "search findings"], ["j k", "next / previous finding"], ["1-5", "switch tab"],
  ["[ ]", "toggle the side windows"], ["y n q", "apply, skip, stop a diff"], ["Esc", "close the detail or a menu"],
];

export const ABOUT = {
  line: "Open-source security for the apps and AI systems you ship. This window reads your reports and runs scans on this machine.",
  license: "MIT",
  type: "Departure Mono by Helena Zhang (OFL)",
  local: "Bound to 127.0.0.1. Nothing on this page loads from another host.",
};
