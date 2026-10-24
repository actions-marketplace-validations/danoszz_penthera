section: Detection

- **More provider token formats.** AWS temporary access keys (`ASIA…`, from
  STS) are found next to long-term ones (`AKIA…`), and so are every GitHub
  token prefix (`gho_`, `ghu_`, `ghs_`, `ghr_` and fine-grained
  `github_pat_`, not only `ghp_`), Stripe restricted live keys (`rk_live_`)
  and Postman API keys (`PMAK-`). AWS's documented example keys (they spell
  `EXAMPLE`) and runs of `X` don't count.
- **reStructuredText, AsciiDoc and `.markdown` files are read as docs.** As in
  `.md` and `.txt`, only the rules that match a fixed shape (provider keys,
  private keys) run on them.
