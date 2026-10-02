#!/usr/bin/env python3
"""Cut, normalise and encode downloaded Epidemic Sound effects into licensed-audio/sfx/ (gitignored),
and write src/audio/es-banks.json, which src/audio/samples.ts imports. Then scripts/audio-upload.sh
puts the clips on the CDN the game streams from.

Usage: python3 scripts/es-sfx.py [downloads dir]

Each clip is cut either from its onset (the first moment within 30 dB of its peak) or around its
loudest 50 ms (for long recordings such as a two-minute collapse or a 20 s jet pass), faded out,
peak-normalised and encoded as mono 112 kbps mp3. The clips are licensed; only the bank list is
committed (the files live on the CDN).
"""
import glob, json, os, subprocess, sys
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads')
OUT = 'licensed-audio/sfx'
BANKS = 'src/audio/es-banks.json'
FF = os.environ.get('FFMPEG', 'ffmpeg')
SR = 44100

# bank, output name, source title substring, mode ('onset' or seconds of lead-in before the peak), length (s)
CLIPS = [
    ('roar', 'roar-0', 'Monster, Monster, Roar', 'onset', 2.6),
    ('roar', 'roar-1', 'Deep Voice, Roar', 'onset', 2.6),
    ('roarBig', 'roar-big', 'Dark Voice, Roar', 'onset', 5.0),
    ('collapse', 'collapse-0', 'Stone Wall Collapsing', 0.3, 3.2),
    ('collapse', 'collapse-1', 'Big Blocks Structure Collapse', 0.15, 2.8),
    ('collapseBig', 'collapse-big', 'Building Collapsing', 0.4, 4.5),
    ('explosion', 'explosion-0', 'Detonation 02', 'onset', 1.8),
    ('explosion', 'explosion-1', 'Detonation 03', 'onset', 1.8),
    ('explosion', 'explosion-2', 'Detonation 04', 'onset', 1.8),
    ('explosionBig', 'explosion-big-0', 'Rocket Launcher, Blast, Big, Heavy', 'onset', 2.8),
    ('explosionBig', 'explosion-big-1', 'TNT, Heavy Blast', 0.05, 3.5),
    ('stomp', 'stomp-0', 'Deep Hit, Heavy, Reverb', 'onset', 2.6),
    ('stomp', 'stomp-1', 'Impact Rock Ground 10', 'onset', 2.2),
    ('stomp', 'stomp-2', 'Dark, Cinematic, Heavy Hit, Rumble', 'onset', 3.0),
    ('cannon', 'cannon-0', 'Cannon, Fire, Low 02', 'onset', 2.0),
    ('cannon', 'cannon-1', 'Cannon, Fire, Distant', 'onset', 2.0),
    ('car', 'car-0', 'Car Crush, Metal Rattle, Demolish, Junkyard 01', 0.08, 1.1),
    ('charge', 'charge-0', 'Energy Overflow, Power Up', 'onset', 2.2),
    ('jet', 'jet-0', 'Fighter Jet Pass', 2.2, 4.2),
    ('siren', 'siren-0', 'Air Raid Siren, Designed, Singular Sequence', 'onset', 4.0),
    ('rifle', 'rifle-0', 'Burst, Short, Close, Reverberant', 'onset', 1.2),
    ('rifle', 'rifle-1', 'Burst Fire, Distant, Reverberant', 'onset', 1.6),
]

# peak level, min gap (ms), max voices
BANKS = {
    'roar': (0.6, 600, 1), 'roarBig': (0.7, 1500, 1),
    'collapse': (0.4, 150, 2), 'collapseBig': (0.55, 400, 2),
    'explosion': (0.45, 90, 3), 'explosionBig': (0.65, 300, 2),
    'stomp': (0.7, 200, 1), 'cannon': (0.45, 150, 2), 'car': (0.35, 80, 2),
    'charge': (0.35, 500, 1), 'jet': (0.5, 800, 2), 'siren': (0.3, 2500, 1), 'rifle': (0.18, 140, 2),
}


def decode(path):
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def cut(x, mode, length):
    win = int(0.05 * SR)
    frames = x[: len(x) // win * win].reshape(-1, win)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    peak_f = int(rms.argmax())
    if mode == 'onset':
        thresh = rms.max() * 10 ** (-30 / 20)
        start = max(0, int(np.argmax(rms > thresh)) * win - int(0.01 * SR))
    else:
        start = max(0, peak_f * win - int(mode * SR))
    y = x[start : start + int(length * SR)].copy()
    fade = min(len(y), int(0.25 * length * SR))
    y[-fade:] *= np.linspace(1, 0, fade) ** 2
    y[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return y / max(1e-6, np.abs(y).max()) * 0.95


def main():
    os.makedirs(OUT, exist_ok=True)
    banks = {}
    for bank, name, sub, mode, length in CLIPS:
        hits = [p for p in glob.glob(os.path.join(SRC, 'ES_*.mp3')) if sub in os.path.basename(p) and ' (1)' not in p]
        if not hits:
            print('missing:', sub)
            continue
        y = cut(decode(hits[0]), mode, length)
        subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '112k', f'{OUT}/{name}.mp3'], input=y.astype(np.float32).tobytes(), check=True)
        banks.setdefault(bank, []).append(f'{name}.mp3')
        print(f'{bank:13s} {name:16s} {len(y) / SR:4.1f}s  <- {os.path.basename(hits[0])[3:70]}')
    out = {b: {'files': f, 'peak': BANKS[b][0], 'gap': BANKS[b][1], 'voices': BANKS[b][2]} for b, f in banks.items()}
    with open(BANKS, 'w') as fh:
        json.dump(out, fh, indent=1)
    print(f'{sum(len(f) for f in banks.values())} clips in {len(banks)} banks -> {BANKS}')


if __name__ == '__main__':
    main()
