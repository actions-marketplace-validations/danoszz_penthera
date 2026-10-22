# Link-preview reel: the PHP runtime advisory of 21 October 2026.
# site/tools/reel.mjs prepares $PENTHERA_MEDIA/shop (a Dockerfile pinning
# php:8.3.12-apache, demo data) and renders this with `vhs -o`. Sized for the
# reel: 1600x840 scales down to its 1200x630 frame, wide enough that the
# findings do not wrap.
Require node
Source assets/tapes/_settings.tape
Set Width 1600
Set Height 840
Set FontSize 20

Hide
Type `export PENTHERA_NO_ONBOARDING=1 PS1='> ' && alias penthera="node $PENTHERA_ROOT/bin/penthera.js" && cd "$PENTHERA_MEDIA/shop" && clear` Enter
Sleep 500ms
Show

Type "head -1 Dockerfile" Sleep 300ms Enter
Sleep 600ms
Type "penthera --repo . --offline" Sleep 300ms Enter
Sleep 3s
