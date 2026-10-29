section: Detection

- **Provider keys in client JavaScript.** A URL scan now reads the scripts the
  home page loads from its own site (up to 10, 2 MB each) and reports provider
  keys left in them, such as one set in a `NEXT_PUBLIC_` or `VITE_` variable.
  Keys are shown masked. A Google key next to Firebase config is reported at
  low, because Firebase web keys are public by design. Scripts on other sites
  are never requested, and a redirect is followed only to the same site on
  https or with `www.`. Scripts past the first 10 or over 2 MB are not
  checked. Contributed by @divya-o.
