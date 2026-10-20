# Walkthrough, part 2: a scan of the local mock server, offline.
# scripts/media/walkthrough.mjs starts tests/fixtures/mock-server.js on port
# 8765 and renders this with `vhs -o`.
Require node
Source scripts/media/tapes/_video.tape

Hide
Type `export PENTHERA_NO_ONBOARDING=1 PS1='> ' && alias penthera="node $PENTHERA_ROOT/bin/penthera.js" && clear` Enter
Sleep 500ms
Show

Type "penthera http://127.0.0.1:8765 --offline" Sleep 400ms Enter
Sleep 7s
