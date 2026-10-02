#!/usr/bin/env bash
# Uploads the licensed audio (licensed-audio/music/*.mp3 and licensed-audio/sfx/*.mp3, gitignored)
# to Bunny CDN storage, which serves it at https://images.voyage.io/downloads/kaiju-rampage/.
# The game streams from there (src/config.ts AUDIO_BASE); the repository holds only the track and
# bank lists (src/audio/*.json). Re-run after adding tracks or effects; existing files are replaced.
# Needs 1Password access to the Agents vault (the storage key is read here, never printed).
set -euo pipefail
cd "$(dirname "$0")/.."
ZONE=latitude-edge-storage-zone-1
DEST=downloads/kaiju-rampage
KEY=$(op read "op://Agents/BUNNYCDN_STORAGE_ZONE_API_KEY/credential")
export KEY ZONE DEST
upload() { # $1 local file, $2 remote folder
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "AccessKey: $KEY" -H 'Content-Type: audio/mpeg' \
    --data-binary "@$1" "https://storage.bunnycdn.com/$ZONE/$DEST/$2/$(basename "$1")")
  [ "$code" = 201 ] || { echo "FAILED ($code) $1" >&2; return 1; }
  echo "ok $2/$(basename "$1")"
}
export -f upload
n=0
for kind in music sfx; do
  ls licensed-audio/$kind/*.mp3 | xargs -P 6 -I{} bash -c "upload '{}' $kind"
  n=$((n + $(ls licensed-audio/$kind/*.mp3 | wc -l)))
done
echo "uploaded $n files to https://images.voyage.io/$DEST/"
