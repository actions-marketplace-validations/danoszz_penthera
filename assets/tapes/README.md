# Demo tapes

[VHS](https://github.com/charmbracelet/vhs) scripts for the GIFs in `assets/`.
`.github/workflows/demo-media.yml` renders them on every release (and on
demand), renders the walkthrough video, and opens a PR with the results.
Locally, from the repo root:

```bash
vhs assets/tapes/scan.tape
```

| Tape | Output | Shows |
|------|--------|-------|
| `scan.tape` | `assets/demo.gif` (the README hero) | Offline URL scan of the local mock server |
| `agents.tape` | `assets/demo-agents.gif` | `penthera agents` on a malicious AI-tooling fixture |
| `deps-diff.tape` | `assets/demo-deps-diff.gif` | `penthera deps --diff` between two lockfile trees |

`_settings.tape` holds the shared size and the black and white theme with the
`#0000ed` accent. A tape whose name starts with `_` is not rendered on its own.
To add a clip, add a tape here; the workflow picks up every `*.tape`.

## The walkthrough video

`node scripts/media/walkthrough.mjs` writes `assets/walkthrough.mp4` (60 to
90 seconds, under 8 MB, no sound, captions burned in),
`assets/walkthrough-poster.jpg` and `assets/walkthrough.vtt`. The terminal
parts are the tapes in `scripts/media/tapes/`. The dashboard part is
`penthera ui --demo` on 127.0.0.1, driven in headless Chrome and recorded with
the DevTools screencast. It needs Chrome or Chromium (`CHROME=` to point at
one), `vhs` and `ffmpeg` with libx264. Set `KEEP_MEDIA_SCRATCH=1` to keep the
parts for a closer look.
