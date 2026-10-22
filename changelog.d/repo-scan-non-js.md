section: Fixed

- **A file that disappears mid-scan no longer stops the repo scan.** A SQLite
  `-wal` file deleted while `--repo` walked the tree crashed it with `ENOENT`.
  The walker now checks names before it stats an entry and skips any entry
  that is gone, or is no longer a regular file, by the time it is read.
- **Virtualenvs, Python tool caches and note vaults are skipped.** `venv`,
  `.venv`, `site-packages`, `__pycache__`, `.tox`, `.nox`, the mypy, pytest
  and ruff caches, `.obsidian`, and any folder with a `pyvenv.cfg` are no
  longer scanned for secrets. On the Python repository that found this, 42 of
  45 critical and high findings were third-party code in a venv.
- **The secret scan follows `.gitignore`.** In a git work tree, ignored folders
  are skipped like `node_modules`. A key in a single ignored file (the usual
  local `.env`) is still reported, at low with `localOnly: true`, since it is
  never committed.
- **Large files are scanned instead of skipped.** Files are read in 8 MB
  chunks that overlap, up to 512 MB per file (was a 16 MB skip), with the
  same line numbers as before. Runs of 512 or more base64 characters (inlined
  images, fonts) are blanked before matching, so `AIza...` or `AKIA...` shapes
  inside image data are no longer reported.
- **The coverage ledger matches what the secret scan read.** Files in a
  folder the scan skips (a virtualenv, a tool cache, a folder git ignores)
  are listed as "in a folder the secret scan skips", not as read.
