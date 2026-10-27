section: Detection

- **Provider keys in client JavaScript** A URL scan now reads the scripts the home page loads from its own origin (up to 10, 2 MB each) and reports provider keys left in them such as one set in a `NEXT_PUBLIC_` or `VITE_` variable. The key is shown masked. Scripts on other origins are never requested, and scripts past the first 10 or over 2 MB are not checked
