# Walkthrough, part 4: the owner report the dashboard just downloaded.
# scripts/media/walkthrough.mjs saves it to $PENTHERA_MEDIA/downloads and
# renders this with `vhs -o`.
Source scripts/media/tapes/_video.tape
Set FontSize 16

Hide
Type `export PS1='> ' && cd "$PENTHERA_MEDIA/downloads" && clear` Enter
Sleep 500ms
Show

Type "fold -s -w 110 penthera-owner-*.md" Sleep 400ms Enter
Sleep 8s
