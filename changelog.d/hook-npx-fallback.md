section: Fixed

- **The pre-commit hook keeps working when the npx cache is cleaned.** A hook
  installed through `npx penthera` pointed at a copy in npm's cache; once
  that was gone, every commit skipped the check silently. It now falls back
  to the same version through npx (`npx -y penthera@<version> hook run`,
  pinned), and only skips, with a clear warning, when that cannot run either.
