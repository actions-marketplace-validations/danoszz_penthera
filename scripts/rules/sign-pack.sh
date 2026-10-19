#!/usr/bin/env bash
# Sign a rule pack's pack.json. Maintainer only: it needs the private half of
# a key listed in lib/rules/allowed_signers. Never run this in CI; the point
# of the signature is that the key stays on the maintainer's machine (or a
# hardware key), so a compromised workflow cannot produce a trusted pack.
#
#   scripts/rules/sign-pack.sh <pack-dir> [private-key]
#
# private-key defaults to ~/.ssh/id_ed25519. Steps:
#   1. node scripts/rules/build-pack.mjs <pack-dir>   (hashes are current)
#   2. ssh-keygen -Y sign -n penthera-rules            (writes pack.json.sig)
#   3. penthera rules verify <pack-dir>                (checks it against allowed_signers)
# Review `git diff <pack-dir>` before signing: the signature vouches for
# every rule in the pack.
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <pack-dir> [private-key]" >&2
  exit 2
fi
DIR="$1"
KEY="${2:-$HOME/.ssh/id_ed25519}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

[ -f "$DIR/pack.json" ] || { echo "No pack.json in $DIR (run build-pack.mjs first)" >&2; exit 1; }
[ -f "$KEY" ] || { echo "Private key not found: $KEY" >&2; exit 1; }
command -v ssh-keygen >/dev/null || { echo "ssh-keygen not found (OpenSSH 8.1+ needed)" >&2; exit 1; }

node "$ROOT/scripts/rules/build-pack.mjs" "$DIR"
rm -f "$DIR/pack.json.sig"
ssh-keygen -Y sign -f "$KEY" -n penthera-rules "$DIR/pack.json"
node "$ROOT/bin/penthera.js" rules verify "$DIR"
