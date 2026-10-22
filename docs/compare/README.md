# How Penthera compares

> **Pro.** For "how does Penthera compare to the tool I use, and how do I run both?"

Penthera is a free, offline, MIT-licensed security agent. Most teams that use it also
use at least one of the tools below, and these pages are written for them: what
each tool is for, where it goes further than Penthera, and how to run the two
together.

| Page | In one line |
|---|---|
| [Penthera and Socket](socket.md) | Socket watches the package registries; Penthera checks your app and your AI tooling on your machine |
| [Penthera and Snyk](snyk.md) | Snyk brings curated vulnerability data across many languages; Penthera looks at behavior, the running app and agent config |
| [Penthera and GitHub (Dependabot, code scanning)](github.md) | GitHub alerts on known CVEs and runs CodeQL; Penthera's SARIF lands in the same tab |
| [Penthera and OWASP ZAP](zap.md) | ZAP is the deeper dynamic scanner; Penthera is a quicker first pass with source context |
| [Penthera and Semgrep](semgrep.md) | Semgrep is the deeper static analyzer for your code; Penthera adds dependencies, the live app and AI tooling |
| [Penthera and Cloudflare's security-audit skill](cloudflare-security-audit.md) | The skill has a model audit your code in depth; Penthera runs fast, repeatable checks, looks outside the source and verifies fixes |

## How these pages are written

- Every claim about another product comes from that product's public docs or
  pricing page, linked inline. Anything we could not confirm is left out.
- Each page names where the other tool goes further. Most of them go further
  than Penthera somewhere.
- Prices and plans change. Each page has a last-checked date. Check the vendor's
  page before you rely on a number.
- No page claims Penthera finds more than another tool. Its own accuracy is
  measured only on labs we wrote ourselves: precision 0.88 (95% CI 0.69 to
  0.96) and recall 0.91 (95% CI 0.73 to 0.98) on 24 findings
  ([results](../../bench/RESULTS.md)). Accuracy on real projects is not measured
  yet. That is [experiment E1](../research/prereg/E1-real-world-accuracy.md).

Spotted something wrong or out of date? Please open an issue or a pull request.
