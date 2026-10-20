# Walkthrough, part 1: `npx penthera`, the setup wizard, on a copy of
# tests/fixtures/init/app. scripts/media/walkthrough.mjs prepares
# $PENTHERA_MEDIA/my-app and renders this with `vhs -o`. `npx` is a shell
# function here, so the clip runs this checkout and never touches npm.
Require node
Source scripts/media/tapes/_video.tape

Hide
Type `export PS1='> ' && npx() { shift; node "$PENTHERA_ROOT/bin/penthera.js" "$@"; } && cd "$PENTHERA_MEDIA/my-app" && clear` Enter
Sleep 500ms
Show

Type "npx penthera" Sleep 400ms Enter
Sleep 3.5s
# What should Penthera check? Keep the defaults (offline on).
Enter
Sleep 1.2s
# Also check ~/.claude and ~/.cursor? No.
Enter
Sleep 5s
# Pre-commit hook: yes.
Enter
Sleep 1.5s
# The GitHub workflow: not in this clip.
Type "n" Sleep 300ms Enter
Sleep 1s
# reports/ in .gitignore: yes. The fix loop: not now.
Enter
Sleep 800ms
Enter
Sleep 800ms
# The dashboard comes later in the walkthrough.
Type "n" Sleep 300ms Enter
Sleep 4s
