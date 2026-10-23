#!/usr/bin/env bash
# Cuts the README hero loop (assets/demo.gif) from the walkthrough video:
# setup, a scan, the dashboard in Simple and Advanced mode, a fix applied,
# then back to the start. Captions are cropped off; the end crossfades into
# the first frame so the GIF loops without a jump.
#
#   bash scripts/media/hero-gif.sh [assets/walkthrough.mp4] [assets/demo.gif]
#
# Needs ffmpeg. Re-run after scripts/media/walkthrough.mjs re-renders the video;
# the cut points below follow its scenes (see assets/walkthrough.vtt).
set -euo pipefail

IN=${1:-assets/walkthrough.mp4}
OUT=${2:-assets/demo.gif}
FPS=10
WIDTH=960
FADE=0.35

# start:length per scene, in seconds
SCENES=(
  "2.2:2.6"    # npx penthera: framework, lockfiles, AI tooling found
  "24.1:2.8"   # scan of the local mock server, offline
  "36.05:2.6"   # Simple mode: one sentence on whether you can ship
  "46.7:2.8"   # Advanced mode: severity against confidence
  "59.2:2.8"   # a fix applied, re-scanned, kept
)

inputs=()
for s in "${SCENES[@]}"; do inputs+=(-ss "${s%%:*}" -t "${s##*:}" -i "$IN"); done
# The first scene again, for the crossfade that closes the loop.
inputs+=(-ss "${SCENES[0]%%:*}" -t 1 -i "$IN")

n=${#SCENES[@]}
graph=""
for ((i = 0; i <= n; i++)); do
  # Drop the caption band at the bottom, keep the 16:10 frame's top 700 px.
  graph+="[$i:v]crop=1280:700:0:0,fps=$FPS,scale=$WIDTH:-2:flags=lanczos,setpts=PTS-STARTPTS[v$i];"
done
prev="v0"; offset=0
for ((i = 1; i <= n; i++)); do
  len=${SCENES[$((i - 1))]##*:}
  offset=$(echo "$offset + $len - $FADE" | bc)
  graph+="[$prev][v$i]xfade=transition=fade:duration=$FADE:offset=$offset[x$i];"
  prev="x$i"
done
# End exactly where the closing crossfade lands on scene one's first frame.
total=$(echo "$offset + $FADE" | bc)
graph+="[$prev]trim=0:$total,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"

ffmpeg -v error -y "${inputs[@]}" -filter_complex "$graph" -loop 0 "$OUT"
echo "wrote $OUT ($(( $(wc -c < "$OUT") / 1024 )) KB, ${total}s loop)"
