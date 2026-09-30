// English / Japanese UI text. The Japanese was written by an AI model and has not been reviewed by a
// native speaker (README says so too). The news bank has its own Japanese pool in src/shared/bank-ja.ts.
export type Lang = 'en' | 'ja';

const LANG_KEY = 'kaiju.lang';
const listeners = new Set<(l: Lang) => void>();

function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'ja') return q;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

let lang: Lang = initialLang();

export const getLang = () => lang;
export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
  for (const fn of listeners) fn(l);
}
export function onLang(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
document.documentElement.lang = lang;

/** Font stack for Phaser text in the current language (Courier has no kanji). */
export const gameFont = () =>
  lang === 'ja' ? '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif' : '"Courier New", Courier, monospace';
export const JP_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif';

type Entry = { en: string; ja: string };
const S = {
  // HUD
  hp: { en: 'HP', ja: '体力' },
  tier1: { en: 'HATCHLING', ja: '幼獣' },
  tier2: { en: 'BEHEMOTH', ja: '巨獣' },
  tier3: { en: 'CITY-ENDER', ja: '大怪獣' },
  maxSize: { en: '{a} — MAX SIZE', ja: '{a} — 最大サイズ' },
  wave: { en: 'WAVE {n}/{total}', ja: 'ウェーブ {n}/{total}' },
  timer: { en: '{t} until the army regroups', ja: '軍の再編まで {t}' },
  destroyMech: { en: 'DESTROY THE MECH', ja: 'メカを破壊せよ' },
  somethingComing: { en: 'SOMETHING IS COMING…', ja: '何かが近づいている…' },
  flattened: { en: 'BUILDINGS FLATTENED: {n}', ja: '破壊した建物: {n}' },
  stompReady: { en: '[SPACE] STOMP!', ja: '[SPACE] 踏みつけ!' },
  stompCharging: { en: 'STOMP…', ja: '踏みつけ…' },
  bossName: { en: 'M-01 SHIOKAZE GUARDIAN', ja: 'M-01 シオカゼ・ガーディアン' },
  muted: { en: 'MUTED [M]', ja: 'ミュート [M]' },
  stompPrompt: { en: 'SURROUNDED! PRESS SPACE TO STOMP', ja: '包囲された! SPACEで踏みつけ' },
  stompTip: { en: 'TIP: SPACE = STOMP SHOCKWAVE', ja: 'ヒント: SPACE = 踏みつけ衝撃波' },
  // banners
  wave1: { en: 'Hatched in the bay. Hungry. Crush cars, eat the city.', ja: '湾で孵化。腹ぺこ。車を潰して、街を喰らえ。' },
  wave2: { en: 'The army has brought tanks.', ja: '軍が戦車を投入した。' },
  wave3: { en: 'Evacuation sirens across Shiokaze Bay.', ja: '潮風湾に避難警報が鳴り響く。' },
  wave4: { en: 'Armored divisions converge on Downtown.', ja: '機甲師団が中心街に集結中。' },
  wave5: { en: 'Final wave. Something big is coming.', ja: '最終ウェーブ。巨大な何かが来る。' },
  waveTitle: { en: 'WAVE {n}', ja: 'ウェーブ {n}' },
  growth: { en: 'GROWTH SPURT: {name}', ja: '急成長: {name}' },
  tierCopy2: { en: 'Houses crumble underfoot. The tanks take you seriously now.', ja: '足元で家々が崩れる。戦車も本気だ。' },
  tierCopy3: { en: 'Towers crumble underfoot. Tanks are just speed bumps.', ja: '高層ビルも踏み潰せる。戦車はただの段差だ。' },
  warning: { en: 'WARNING', ja: '警告' },
  mechInbound: { en: 'Flagship mech M-01 "SHIOKAZE GUARDIAN" inbound', ja: '旗艦メカ M-01「シオカゼ・ガーディアン」接近中' },
  // level-up
  levelUp: { en: 'LEVEL UP!', ja: 'レベルアップ!' },
  chooseMutation: { en: 'Choose a mutation  ·  [1] [2] [3]  or ←/→ + ENTER', ja: '突然変異を選べ  ·  [1] [2] [3]  または ←/→ + ENTER' },
  new: { en: 'NEW!', ja: '新!' },
  kind_weapon: { en: 'WEAPON', ja: '武器' },
  kind_body: { en: 'BODY', ja: '肉体' },
  kind_stomp: { en: 'STOMP', ja: '踏みつけ' },
  kind_growth: { en: 'GROWTH', ja: '成長' },
  // news
  waveCleared: { en: 'WAVE CLEARED — THE ARMY PULLS BACK', ja: 'ウェーブ突破 — 軍は撤退した' },
  mechDown: { en: 'THE MECH IS DOWN', ja: 'メカ撃破' },
  kaijuFallen: { en: '{kaiju} HAS FALLEN', ja: '{kaiju}、倒れる' },
  switching: { en: 'switching to {ch}…', ja: '{ch} に切り替え中…' },
  breaking: { en: 'BREAKING NEWS', ja: '臨時ニュース' },
  live: { en: '● LIVE', ja: '● 生中継' },
  anchorDesk: { en: 'ANCHOR DESK', ja: 'キャスター' },
  report: { en: 'WAVE {n} OF {t} REPORT', ja: 'ウェーブ {n}/{t} 報告' },
  st_buildings: { en: 'Buildings flattened', ja: '破壊した建物' },
  st_towers: { en: 'Towers toppled', ja: '倒壊した高層ビル' },
  st_cars: { en: 'Vehicles crushed', ja: '潰した車両' },
  st_soldiers: { en: 'Infantry routed', ja: '撃退した歩兵' },
  st_tanks: { en: 'Tanks destroyed', ja: '破壊した戦車' },
  st_near: { en: 'Near-death moments', ja: '瀕死の瞬間' },
  size: { en: 'SIZE: {x}', ja: '大きさ: {x}' },
  lastSeen: { en: 'Last seen: {d}', ja: '最終目撃地点: {d}' },
  ticker: { en: 'TICKER', ja: '速報' },
  srcBank: { en: 'KBN-7 WIRE DESK', ja: 'KBN-7 通信デスク' },
  srcAi: { en: 'AI DESK · {model} (optional live path)', ja: 'AIデスク · {model}（任意のライブ経路）' },
  nextWave: { en: 'PRESS ENTER — WAVE {n}', ja: 'ENTER — ウェーブ {n} へ' },
  youWin: { en: 'YOU WIN! PRESS ENTER FOR A NEW RUN', ja: '勝利! ENTERで新しいラン' },
  gameOver: { en: 'GAME OVER · PRESS ENTER TO TRY AGAIN', ja: 'ゲームオーバー · ENTERで再挑戦' },
  size1: { en: 'roughly the size of a delivery van', ja: '配達用バンほどの大きさ' },
  size2: { en: 'taller than a three-storey house', ja: '三階建ての家より高い' },
  size3: { en: 'skyscraper-scale, visible from the next prefecture', ja: '高層ビル級、隣の県からも見える' },
  // pause
  paused: { en: 'PAUSED', ja: '一時停止' },
  pauseHint: { en: 'P / ESC to resume  ·  M to mute', ja: 'P / ESC で再開  ·  M でミュート' },
  yourMutations: { en: 'YOUR MUTATIONS', ja: 'あなたの突然変異' },
  noMutations: { en: 'None yet. Level up to mutate.', ja: 'まだなし。レベルアップで変異する。' },
  // impact words
  w_kaboom: { en: 'KA-BOOM!', ja: 'ドカーン!' },
  w_crunch: { en: 'CRUNCH!', ja: 'グシャッ!' },
  w_tower1: { en: 'KRAKOOM!', ja: 'ズドーン!' },
  w_tower2: { en: 'DOOOOM!', ja: 'ドドーン!' },
  w_tower3: { en: 'KRA-TOOM!', ja: 'ガラガラ!' },
  w_mechDown: { en: 'MECH DOWN!', ja: 'メカ撃破!' },
  // districts
  d_harbor: { en: 'the Harbor', ja: '港湾地区' },
  d_downtown: { en: 'Downtown', ja: '中心街' },
  d_neon: { en: 'Neon Row', ja: 'ネオン横丁' },
  d_oldtown: { en: 'Old Town', ja: '旧市街' },
  d_hillside: { en: 'Hillside', ja: '丘陵地区' },
  d_midtown: { en: 'Midtown', ja: '中町' },
  // title / menus (DOM)
  tagline: { en: 'TIDEMAW vs. SHIOKAZE BAY', ja: 'タイドモウ 対 潮風湾' },
  pitch: { en: 'Hatch in the bay. Eat the city. Outgrow the army.', ja: '湾で孵り、街を喰らい、軍を超えて巨大化せよ。' },
  kaijuTeaser: { en: 'Kaiju (怪獣): Japanese for "strange beast". The giant-monster genre. Here, the monster is you.', ja: '怪獣: 海から現れ街を踏み潰す巨大生物。今回、怪獣はあなただ。' },
  m_start: { en: 'Start rampage', ja: '暴れ始める' },
  m_how: { en: 'How to play', ja: '遊び方' },
  m_codex: { en: 'Mutations', ja: '突然変異' },
  m_scores: { en: 'High scores', ja: 'ハイスコア' },
  m_settings: { en: 'Settings', ja: '設定' },
  back: { en: 'Back', ja: '戻る' },
  whatIs: { en: 'What is a kaiju?', ja: '怪獣とは?' },
  whatIsBody: {
    en: 'Kaiju (怪獣) is Japanese for "strange beast". It names a genre of films where a skyscraper-sized creature rises from the sea and flattens a city while the army fights back. In this game, you are the kaiju.',
    ja: '怪獣とは、高層ビルほどの巨大な生き物が海から現れ、軍と戦いながら街を踏み潰す――そんな映画のジャンルです。このゲームでは、あなたが怪獣です。',
  },
  how_move: { en: 'Move with WASD or the arrow keys (gamepad: left stick).', ja: 'WASD か矢印キーで移動（ゲームパッド: 左スティック）。' },
  how_attack: { en: 'Your claws attack on their own. Mutations add more weapons.', ja: '爪は自動で攻撃する。変異で武器が増える。' },
  how_stomp: { en: 'SPACE (gamepad: A) stomps: a shockwave that flattens everything nearby. Use it when you are surrounded.', ja: 'SPACE（ゲームパッド: A）で踏みつけ。周囲を吹き飛ばす衝撃波だ。囲まれたら使え。' },
  how_grow: { en: 'Crush the city to grow. The bigger you are, the bigger the things you crush: cars, then houses, then towers.', ja: '街を壊して成長しよう。大きくなるほど、車 → 家 → 高層ビルと潰せるものが増える。' },
  how_level: { en: 'Defeat the military for crystals. Each level-up offers three mutations: press 1, 2 or 3.', ja: '軍を倒して結晶を集めよう。レベルアップごとに3つの変異から選べる（1・2・3キー）。' },
  how_win: { en: 'Survive five waves, then destroy the flagship mech.', ja: '5つのウェーブを生き延び、旗艦メカを破壊せよ。' },
  how_keys: { en: 'P or Esc pauses. M mutes. L switches language.', ja: 'P か Esc で一時停止。M でミュート。L で言語切替。' },
  codexIntro: { en: 'Every mutation you can be offered on level-up.', ja: 'レベルアップで出現する、すべての突然変異。' },
  maxLv: { en: 'max Lv {n}', ja: '最大 Lv {n}' },
  owned: { en: 'owned Lv {n}', ja: '所持 Lv {n}' },
  bestRun: { en: 'Best run', ja: '最高記録' },
  noRuns: { en: 'No runs yet. Go make the news.', ja: 'まだ記録なし。ニュースになれ。' },
  runMech: { en: 'Mech destroyed', ja: 'メカ撃破' },
  runWave: { en: 'Reached wave {n}', ja: 'ウェーブ {n} 到達' },
  runBuildings: { en: '{n} buildings flattened', ja: '建物 {n}棟を破壊' },
  s_language: { en: 'Language', ja: '言語' },
  s_music: { en: 'Music', ja: '音楽' },
  s_sfx: { en: 'Sound effects', ja: '効果音' },
  on: { en: 'On', ja: 'オン' },
  off: { en: 'Off', ja: 'オフ' },
  jpNote: { en: 'The Japanese text was written by an AI and has not yet been reviewed by a native speaker.', ja: '日本語テキストはAIが作成したもので、ネイティブによる校正はまだ行われていません。' },
  nowPlaying: { en: 'NOW PLAYING', ja: '再生中' },
  soundHint: { en: 'Click or press any key for sound', ja: 'クリックかキー入力でサウンド開始' },
  musicOff: { en: 'Music off (M)', ja: '音楽オフ（M）' },
  credits: {
    en: 'A SHIOKAZE BAY DISASTER IN FIVE WAVES · STARRING TIDEMAW · WITH THE KBN-7 NIGHT DESK',
    ja: '潮風湾大災害・全五波 · 主演 タイドモウ · 協力 KBN-7 報道部',
  },
  keyHint: { en: 'Enter start · ↑↓ menu · L language · M music', ja: 'Enter 開始 · ↑↓ メニュー · L 言語 · M 音楽' },
  kaijuName: { en: 'TIDEMAW', ja: 'タイドモウ' },
} satisfies Record<string, Entry>;

export type Key = keyof typeof S;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const raw = S[key][lang];
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** For tests: every key must have both languages. */
export const ALL_KEYS = Object.keys(S) as Key[];
export const rawEntry = (k: Key): Entry => S[k];

const DISTRICT_KEYS: Record<string, Key> = {
  'the Harbor': 'd_harbor', Downtown: 'd_downtown', 'Neon Row': 'd_neon', 'Old Town': 'd_oldtown', Hillside: 'd_hillside', Midtown: 'd_midtown',
};
export const districtName = (d: string) => (DISTRICT_KEYS[d] ? t(DISTRICT_KEYS[d]) : d);

export const tierName = (tier: number) => t((['tier1', 'tier2', 'tier3'] as const)[tier - 1]);

// ── Upgrades (the English name stays canonical for stats and the news bank) ──
interface UpText {
  glyph: string;
  en: { name: string; first: string; later?: string };
  ja: { name: string; first: string; later?: string };
}
export const UPGRADE_TEXT: Record<string, UpText> = {
  claws: { glyph: '爪', en: { name: 'Serrated Claws', first: 'Claw swipe damage +30%.' }, ja: { name: 'ギザギザの爪', first: '爪攻撃のダメージ +30%。' } },
  reach: { glyph: '腕', en: { name: 'Long Reach', first: 'Claw swipe range +20%.' }, ja: { name: '長い腕', first: '爪の攻撃範囲 +20%。' } },
  frenzy: { glyph: '狂', en: { name: 'Frenzy', first: 'All attacks fire 12% faster.' }, ja: { name: '狂乱', first: '全攻撃の速度 +12%。' } },
  breath: {
    glyph: '息',
    en: { name: 'Atomic Breath', first: 'Exhale a searing beam at the nearest threat.', later: 'Breath damage +30%, beam longer.' },
    ja: { name: '原子熱線', first: '最寄りの敵へ灼熱の光線を吐く。', later: '熱線のダメージ +30%、射程も伸びる。' },
  },
  tail: {
    glyph: '尾',
    en: { name: 'Tail Spin', first: 'Periodically spin, smashing everything around you.', later: 'Tail Spin damage and radius up.' },
    ja: { name: '回転尻尾', first: '定期的に回転し、周囲のすべてを粉砕する。', later: '回転尻尾のダメージと範囲が上昇。' },
  },
  spines: {
    glyph: '棘',
    en: { name: 'Spine Volley', first: 'Launch homing dorsal spines.', later: '+1 spine per volley.' },
    ja: { name: '背びれ連射', first: '追尾する背びれを発射する。', later: '一斉射ごとに背びれ +1。' },
  },
  aura: {
    glyph: '輝',
    en: { name: 'Fallout Aura', first: 'A radioactive glow burns anything close.', later: 'Aura damage +60%.' },
    ja: { name: '放射能オーラ', first: '放射能の輝きが近くのものを焼く。', later: 'オーラのダメージ +60%。' },
  },
  hide: { glyph: '皮', en: { name: 'Thick Hide', first: '+30 max HP and heal 30.' }, ja: { name: '分厚い皮膚', first: '最大体力 +30、体力を30回復。' } },
  regen: { glyph: '癒', en: { name: 'Regeneration', first: 'Regenerate 1.2 HP per second.' }, ja: { name: '再生能力', first: '毎秒1.2の体力を回復する。' } },
  plating: { glyph: '鱗', en: { name: 'Scaled Plating', first: 'Take 10% less damage.' }, ja: { name: '鱗の装甲', first: '受けるダメージ -10%。' } },
  speed: { glyph: '速', en: { name: 'Quickstep', first: 'Move 10% faster.' }, ja: { name: '俊足', first: '移動速度 +10%。' } },
  aftershock: { glyph: '震', en: { name: 'Aftershock', first: 'Stomp radius +25%.' }, ja: { name: '余震', first: '踏みつけの範囲 +25%。' } },
  tectonic: { glyph: '鼓', en: { name: 'Tectonic Rhythm', first: 'Stomp recharges 20% faster.' }, ja: { name: '地殻の鼓動', first: '踏みつけの再使用が20%速くなる。' } },
  magnet: { glyph: '磁', en: { name: 'Magnetism', first: 'Pick up energy crystals from 40% farther.' }, ja: { name: '磁力', first: 'エネルギー結晶を40%遠くから回収する。' } },
  hormone: { glyph: '育', en: { name: 'Growth Hormone', first: 'Grow 25% faster from destruction.' }, ja: { name: '成長ホルモン', first: '破壊による成長 +25%。' } },
  rampage: { glyph: '暴', en: { name: 'Rampage', first: 'Each building destroyed heals 1.5 HP.' }, ja: { name: '大暴れ', first: '建物を壊すたびに体力を1.5回復。' } },
};

export function upName(id: string) {
  const u = UPGRADE_TEXT[id];
  return u ? u[lang].name : id;
}
export function upDesc(id: string, nextLevel: number) {
  const u = UPGRADE_TEXT[id];
  if (!u) return '';
  const l = u[lang];
  return nextLevel > 1 && l.later ? l.later : l.first;
}
export const upGlyph = (id: string) => UPGRADE_TEXT[id]?.glyph ?? '?';
