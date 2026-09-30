#!/bin/zsh
# Trims, normalises and encodes downloaded Epidemic Sound effects into public/sfx/es/ (gitignored)
# and writes the bank list the game reads (src/audio/samples.ts). Usage: scripts/es-sfx.sh [downloads dir]
# Each line below: bank, output name, seconds to keep, source-title substring (matched in the dir).
set -e
DIR=${1:-$HOME/Downloads}
OUT=public/sfx/es
FF=${FFMPEG:-ffmpeg}
mkdir -p $OUT
typeset -A BANKFILES
enc() { # bank name secs pattern
  local src=$(ls "$DIR"/*"$4"* 2>/dev/null | grep -v ' (1)' | head -1)
  if [[ -z $src ]]; then echo "missing: $4"; return; fi
  # trim leading silence, keep N seconds, fade the tail, peak-normalise, mono 112k
  $FF -hide_banner -loglevel error -y -i "$src" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:$3,afade=t=out:st=$(( $3 * 0.8 )):d=$(( $3 * 0.2 )),loudnorm=I=-14:TP=-1:LRA=11" \
    -ac 1 -ar 44100 -b:a 112k -map_metadata -1 "$OUT/$2.mp3"
  BANKFILES[$1]="${BANKFILES[$1]} $2.mp3"
  echo "$1 <- $2 ($3s) from ${src:t}"
}
enc roar roar-0 2.2 "Monster, Roar"
enc roar roar-1 2.2 "Deep Voice, Roar"
enc roarBig roar-big 4.5 "Dark Voice, Roar"
enc collapse collapse-0 3.5 "Stone Wall Collapsing"
enc collapse collapse-1 3.5 "Big Blocks Structure Collapse"
enc explosionBig explosion-big 2.5 "Rocket Launcher, Blast, Big, Heavy"
enc explosion explosion-0 1.6 "Detonation 01"
enc explosion explosion-1 1.6 "Detonation 02"
enc explosion explosion-2 1.6 "Detonation 03"
enc stomp stomp-0 2.5 "Deep Hit, Heavy, Reverb"
enc stomp stomp-1 2.0 "Impact Rock Ground 10"
enc cannon cannon-0 1.8 "Cannon, Fire, Low 02"
enc cannon cannon-1 1.8 "Cannon, Fire, Distant"
enc car car-0 1.2 "Car Crush, Metal Rattle, Demolish, Junkyard 01"
enc charge charge-0 2.5 "Energy Overflow, Power Up"
enc jet jet-0 4.0 "Small Jet Turbine Plane, Flyby 02"
enc siren siren-0 3.5 "Air Raid Siren, Designed, Singular Sequence"
# bank settings: peak, gap (ms), voices
typeset -A SET
SET=(roar '0.8,600,1' roarBig '0.85,1500,1' collapse '0.7,140,2' explosionBig '0.8,300,1' explosion '0.6,90,3' stomp '0.85,200,1' cannon '0.5,150,2' car '0.4,60,3' charge '0.4,500,1' jet '0.55,800,2' siren '0.35,2500,1')
{
  echo '{'
  first=1
  for b in ${(k)BANKFILES}; do
    IFS=, read peak gap voices <<< "${SET[$b]}"
    files=$(echo ${BANKFILES[$b]} | tr ' ' '\n' | sed 's/.*/"&"/' | paste -sd, -)
    [[ $first == 1 ]] || echo ','
    first=0
    printf '  "%s": { "files": [%s], "peak": %s, "gap": %s, "voices": %s }' $b "$files" $peak $gap $voices
  done
  echo
  echo '}'
} > $OUT/banks.json
cat $OUT/banks.json
