// The upgrade pool: 16 upgrades, offered 3 at a time on level-up.

export interface Mods {
  clawDmg: number;
  clawRange: number;
  cooldown: number;
  speed: number;
  maxHpBonus: number;
  regen: number;
  stompRadius: number;
  stompCd: number;
  magnet: number;
  massGain: number;
  rampageHeal: number;
  armor: number;
  breath: number;
  tail: number;
  spines: number;
  aura: number;
}

export const baseMods = (): Mods => ({
  clawDmg: 1, clawRange: 1, cooldown: 1, speed: 1, maxHpBonus: 0, regen: 0, stompRadius: 1, stompCd: 1,
  magnet: 1, massGain: 1, rampageHeal: 0, armor: 0, breath: 0, tail: 0, spines: 0, aura: 0,
});

export interface UpgradeDef {
  id: string;
  name: string;
  max: number;
  kind: 'weapon' | 'body' | 'stomp' | 'growth';
  desc: (nextLevel: number) => string;
  apply: (m: Mods, onHeal: (amount: number) => void) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'claws', name: 'Serrated Claws', max: 5, kind: 'weapon', desc: () => 'Claw swipe damage +30%.', apply: (m) => { m.clawDmg += 0.3; } },
  { id: 'reach', name: 'Long Reach', max: 3, kind: 'weapon', desc: () => 'Claw swipe range +20%.', apply: (m) => { m.clawRange += 0.2; } },
  { id: 'frenzy', name: 'Frenzy', max: 4, kind: 'weapon', desc: () => 'All attacks fire 12% faster.', apply: (m) => { m.cooldown *= 0.88; } },
  {
    id: 'breath', name: 'Atomic Breath', max: 5, kind: 'weapon',
    desc: (n) => (n === 1 ? 'Exhale a searing beam at the nearest threat.' : 'Breath damage +30%, beam longer.'),
    apply: (m) => { m.breath += 1; },
  },
  {
    id: 'tail', name: 'Tail Spin', max: 5, kind: 'weapon',
    desc: (n) => (n === 1 ? 'Periodically spin, smashing everything around you.' : 'Tail Spin damage and radius up.'),
    apply: (m) => { m.tail += 1; },
  },
  {
    id: 'spines', name: 'Spine Volley', max: 5, kind: 'weapon',
    desc: (n) => (n === 1 ? 'Launch homing dorsal spines.' : '+1 spine per volley.'),
    apply: (m) => { m.spines += 1; },
  },
  {
    id: 'aura', name: 'Fallout Aura', max: 3, kind: 'weapon',
    desc: (n) => (n === 1 ? 'A radioactive glow burns anything close.' : 'Aura damage +60%.'),
    apply: (m) => { m.aura += 1; },
  },
  { id: 'hide', name: 'Thick Hide', max: 5, kind: 'body', desc: () => '+30 max HP and heal 30.', apply: (m, heal) => { m.maxHpBonus += 30; heal(30); } },
  { id: 'regen', name: 'Regeneration', max: 4, kind: 'body', desc: () => 'Regenerate 1.2 HP per second.', apply: (m) => { m.regen += 1.2; } },
  { id: 'plating', name: 'Scaled Plating', max: 4, kind: 'body', desc: () => 'Take 10% less damage.', apply: (m) => { m.armor = Math.min(0.6, m.armor + 0.1); } },
  { id: 'speed', name: 'Quickstep', max: 4, kind: 'body', desc: () => 'Move 10% faster.', apply: (m) => { m.speed += 0.1; } },
  { id: 'aftershock', name: 'Aftershock', max: 3, kind: 'stomp', desc: () => 'Stomp radius +25%.', apply: (m) => { m.stompRadius += 0.25; } },
  { id: 'tectonic', name: 'Tectonic Rhythm', max: 3, kind: 'stomp', desc: () => 'Stomp recharges 20% faster.', apply: (m) => { m.stompCd *= 0.8; } },
  { id: 'magnet', name: 'Magnetism', max: 3, kind: 'growth', desc: () => 'Pick up energy crystals from 40% farther.', apply: (m) => { m.magnet += 0.4; } },
  { id: 'hormone', name: 'Growth Hormone', max: 3, kind: 'growth', desc: () => 'Grow 25% faster from destruction.', apply: (m) => { m.massGain += 0.25; } },
  { id: 'rampage', name: 'Rampage', max: 3, kind: 'growth', desc: () => 'Each building destroyed heals 1.5 HP.', apply: (m) => { m.rampageHeal += 1.5; } },
];

export function rollOffer(levels: Record<string, number>, rand: () => number, n = 3): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.max);
  const out: UpgradeDef[] = [];
  // Weight unowned weapons up a little early so builds diversify.
  const weight = (u: UpgradeDef) => (u.kind === 'weapon' && !levels[u.id] ? 1.6 : 1);
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, u) => a + weight(u), 0);
    let r = rand() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) if ((r -= weight(pool[i])) <= 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
