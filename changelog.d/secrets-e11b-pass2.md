section: Detection

- **The password rule reads key names by their words.** It finds a password
  under a quoted key (`"password": "…"`, `'db_pass' => '…'`) and under a key
  with a prefix or suffix (`old_password`, `password1`, `adminPassword`,
  `DB_PASSWORD`), with `:`, `=`, `=>` or `:=`. Keys that are about a password
  rather than holding one (`password_hash`, `LABEL_PASSWORD`,
  `allow_empty_password`) are skipped.
- **Fewer false alarms on passwords.** Stored hashes (`$2b$…`, `{SSHA}…`),
  variable references (`$DB_PASS`, `#{password}`), booleans, labels and
  translated words, names (`keystore.password`), published defaults (`admin`,
  `changeit`), keyboard and counting sequences (`123456`, `qwerty`) and test
  values (`test123`) no longer count as a hardcoded password. Files in a
  translation folder (`locales/`, `i18n/`) get the fixed-shape rules only, as
  docs do.
