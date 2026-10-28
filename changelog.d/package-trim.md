section: Changed

- **A smaller npm package.** The package no longer ships `CHANGELOG.md`.
  Nothing reads it at run time, and the full history stays on
  [GitHub](https://github.com/danoszz/penthera/blob/main/CHANGELOG.md). This
  takes the package from 2,570 KB to 2,445 KB unpacked (945 KB to 896 KB
  packed). Scans, rules and output are the same.
