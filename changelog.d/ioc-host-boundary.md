section: Fixed

- **No false litellm alarm.** Host indicators from the rule packs now match
  whole hostnames only, and every occurrence is checked. The attacker domain
  `litellm.cloud` no longer fires on `litellm.cloudflare_api_key` in the
  benign litellm 1.106.3, which E11 found. Subdomains, URLs and a host at the
  end of a sentence still match.
