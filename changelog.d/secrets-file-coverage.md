section: Detection

- **The secret scan reads more files.** It now reads key files (`.pem`, `.key`,
  `.p8`, `.ppk`), PHP, C#, `.properties`, `.conf`, `.xml` and Terraform state,
  plus any file without an extension that starts with a private-key header. In
  `.txt` and `.md` it runs only the rules that match a fixed shape (provider key
  prefixes and private keys), because docs are full of example passwords.
- **Fewer false alarms on secrets.** A private key must have its base64 body,
  so docs that only name the header, or elide the key as `...`, no longer count.
  A value that is just the key's name (`password = "password"`) and AWS's
  documented example access key are treated as placeholders.
