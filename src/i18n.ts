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
  chooseMutation: { en: 'Choose a mutation  ·  [1] [2] [3]  or ←/→ + ENTER / SPACE', ja: '突然変異を選べ  ·  [1] [2] [3]  または ←/→ + ENTER / SPACE' },
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
  nextWave: { en: 'ENTER / SPACE — WAVE {n}', ja: 'ENTER / SPACE — ウェーブ {n} へ' },
  youWin: { en: 'YOU WIN! PRESS ENTER FOR A NEW RUN', ja: '勝利! ENTERで新しいラン' },
  gameOver: { en: 'GAME OVER · PRESS ENTER TO TRY AGAIN', ja: 'ゲームオーバー · ENTERで再挑戦' },
  size1: { en: 'roughly the size of a delivery van', ja: '配達用バンほどの大きさ' },
  size2: { en: 'taller than a three-storey house', ja: '三階建ての家より高い' },
  size3: { en: 'skyscraper-scale, visible from the next prefecture', ja: '高層ビル級、隣の県からも見える' },
  // pause
  paused: { en: 'PAUSED', ja: '一時停止' },
  pauseHint: { en: 'P / ESC to resume  ·  M to mute', ja: 'P / ESC で再開  ·  M でミュート' },
  p_resume: { en: 'RESUME  (P)', ja: '再開  (P)' },
  p_exit: { en: 'EXIT TO TITLE  (Q)', ja: 'タイトルへ戻る  (Q)' },
  exitTitle: { en: 'EXIT THIS RUN?', ja: 'このランを終了しますか？' },
  exitBody: { en: 'You go back to the title screen. This run ends here and is not scored.', ja: 'タイトル画面に戻ります。このランはここで終わり、スコアは記録されません。' },
  exitYes: { en: 'YES, EXIT  (Y)', ja: 'はい、終了  (Y)' },
  exitNo: { en: 'KEEP PLAYING  (N)', ja: '続ける  (N)' },
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
  how_keys: { en: 'P or Esc pauses (then Q exits to the title, after a confirm). M mutes. L switches language.', ja: 'P か Esc で一時停止（Q で確認のうえタイトルへ）。M でミュート。L で言語切替。' },
  how_landmarks: { en: 'Pagodas, Shiokaze Castle and the KBN-7 tower are worth big points, feed your growth, and make the news.', ja: '五重塔・潮風城・KBN-7タワーは高得点。成長の糧になり、ニュースにもなる。' },
  how_diff: { en: 'Pick Easy, Medium or Hard beside Start (← →). Harder modes score more.', ja: 'スタートの横で「やさしい・ふつう・むずかしい」を選ぶ（← →）。難しいほど高得点。' },
  codexIntro: { en: 'Every mutation you can be offered on level-up.', ja: 'レベルアップで出現する、すべての突然変異。' },
  maxLv: { en: 'max Lv {n}', ja: '最大 Lv {n}' },
  owned: { en: 'owned Lv {n}', ja: '所持 Lv {n}' },
  bestRun: { en: 'Best run', ja: '最高記録' },
  noRuns: { en: 'No runs yet. Go make the news.', ja: 'まだ記録なし。ニュースになれ。' },
  runMech: { en: 'Mech destroyed', ja: 'メカ撃破' },
  runWave: { en: 'Reached wave {n}', ja: 'ウェーブ {n} 到達' },
  runBuildings: { en: '{n} buildings flattened', ja: '建物 {n}棟を破壊' },
  s_language: { en: 'Language', ja: '言語' },
  s_difficulty: { en: 'Difficulty', ja: '難易度' },
  lm_pagoda: { en: 'Five-Storey Pagoda', ja: '五重塔' },
  lm_castle: { en: 'Shiokaze Castle', ja: '潮風城' },
  lm_tvtower: { en: 'KBN-7 Tower', ja: 'KBN-7タワー' },
  lm_torii: { en: 'Torii Gate', ja: '鳥居' },
  landmarkDown: { en: 'LANDMARK DESTROYED', ja: '名所 崩壊' },
  diff_easy: { en: 'Easy', ja: 'やさしい' },
  diff_medium: { en: 'Medium', ja: 'ふつう' },
  diff_hard: { en: 'Hard', ja: 'むずかしい' },
  diffDesc_easy: { en: 'The army goes easy on you. Score ×0.75.', ja: '軍は手加減してくる。スコア ×0.75。' },
  diffDesc_medium: { en: 'A fair fight. Score ×1.', ja: '互角の戦い。スコア ×1。' },
  diffDesc_hard: { en: 'Tougher troops, fewer heals, more air strikes. Score ×1.5.', ja: '手強い部隊、少ない回復、増える空爆。スコア ×1.5。' },
  diffDaily: { en: 'The daily rampage is always Medium.', ja: 'デイリーは常に「ふつう」。' },
  h_diff: { en: 'Mode', ja: '難易度' },
  s_music: { en: 'Music', ja: '音楽' },
  m_sound: { en: 'Sound test', ja: 'サウンドテスト' },
  soundOpen: { en: 'Open the sound test', ja: 'サウンドテストを開く' },
  soundIntro: { en: 'Every track in the game, by where it plays. Press play to listen, and vote to keep or cut it.', ja: 'ゲーム内の全曲を、流れる場面ごとに。再生して聴き、残すかカットするか投票しよう。' },
  soundNone: { en: 'This copy has no recorded tracks, so the procedural composer plays instead.', ja: 'このコピーには収録曲がないため、自動作曲の音楽が流れます。' },
  soundCopy: { en: 'Copy my picks', ja: '投票をコピー' },
  soundCopied: { en: 'Copied. Paste it wherever you like.', ja: 'コピーしました。好きな場所に貼り付けてください。' },
  soundKeep: { en: 'Keep', ja: '残す' },
  soundCut: { en: 'Cut', ja: 'カット' },
  st_title: { en: 'Title screen', ja: 'タイトル画面' },
  st_tier1: { en: 'Tier 1 · Hatchling', ja: '第1段階 · ハッチリング' },
  st_tier2: { en: 'Tier 2 · Behemoth', ja: '第2段階 · ベヒモス' },
  st_tier3: { en: 'Tier 3 · City-Ender', ja: '第3段階 · シティエンダー' },
  st_boss: { en: 'Boss', ja: 'ボス戦' },
  st_victory: { en: 'Victory', ja: '勝利' },
  st_defeat: { en: 'Defeat', ja: '敗北' },
  st_candidate: { en: '8-bit candidates (not in the game yet)', ja: '8ビット候補曲（未採用）' },
  candNote: { en: 'Each one is tagged with the stage it was picked for. Keep the ones you like and they can join the rotation.', ja: 'それぞれ、想定した場面のタグ付き。気に入った曲を「残す」にすれば、ローテーションに加えられます。' },
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
  keyHint: { en: 'Enter/Space start · ↑↓ menu · ←→ difficulty · L language · M music', ja: 'Enter/Space 開始 · ↑↓ メニュー · ←→ 難易度 · L 言語 · M 音楽' },
  kaijuName: { en: 'TIDEMAW', ja: 'タイドモウ' },
  // M2: events, items, score
  surrounded: { en: 'SURROUNDED!', ja: '包囲網!' },
  surroundedSub: { en: 'Infantry closing in from every side. Stomp!', ja: '四方から歩兵が迫る。踏みつけろ!' },
  walkerTitle: { en: 'HEAVY WALKER', ja: '重装ウォーカー' },
  walkerSub: { en: 'A prototype mech is closing in. It carries a supply crate.', ja: '試作メカが接近中。補給物資を積んでいる。' },
  airStrike: { en: 'AIR STRIKE', ja: '空爆' },
  airStrikeSub: { en: 'Jets inbound. Get off the red lines.', ja: 'ジェット機接近。赤い線から離れろ。' },
  crate: { en: 'SUPPLY CRATE', ja: '補給物資' },
  crateMaxed: { en: 'Build complete: +50% HP and 2,000 points', ja: '強化完了: 体力50%回復、2,000点' },
  evolution: { en: 'EVOLUTION!', ja: '進化!' },
  itemMagnet: { en: 'MAGNET!', ja: '磁石!' },
  itemQuake: { en: 'QUAKE CORE!', ja: '震源の石!' },
  itemRage: { en: 'KAIJU RAGE!', ja: '怪獣激怒!' },
  score: { en: 'SCORE {n}', ja: 'スコア {n}' },
  combo: { en: 'COMBO {n}  ×{m}', ja: 'コンボ {n}  ×{m}' },
  rage: { en: 'RAGE {s}s', ja: '激怒 {s}秒' },
  waveEndless: { en: 'WAVE {n} · ENDLESS', ja: 'ウェーブ {n} · エンドレス' },
  endlessTitle: { en: 'ENDLESS RAMPAGE', ja: 'エンドレス暴走' },
  endlessSub: { en: 'The army will not stop. Neither will you.', ja: '軍は止まらない。あなたも。' },
  waveEndlessSub: { en: 'They keep coming, and they keep getting bigger.', ja: '敵は増え続け、強くなり続ける。' },
  reroll: { en: '[R] REROLL ({n})', ja: '[R] 引き直し（{n}）' },
  skip: { en: '[X] SKIP: HEAL 25%', ja: '[X] スキップ: 体力25%回復' },
  resVictory: { en: 'RAMPAGE COMPLETE', ja: '大暴れ完了' },
  resDefeat: { en: 'RAMPAGE OVER', ja: '大暴れ終了' },
  resEndless: { en: 'ENDLESS OVER', ja: 'エンドレス終了' },
  finalScore: { en: 'FINAL SCORE', ja: '最終スコア' },
  grade: { en: 'GRADE', ja: '評価' },
  newHigh: { en: 'NEW HIGH SCORE! RANK {n}', ja: 'ハイスコア更新! {n}位' },
  enterName: { en: 'ENTER YOUR NAME', ja: '名前を入力' },
  nameHint: { en: '↑↓ letter · ←→ move · type A–Z · ENTER / SPACE confirm', ja: '↑↓ 文字 · ←→ 移動 · A–Z 入力 · ENTER / SPACE 決定' },
  r_waves: { en: 'Waves survived', ja: '生き延びたウェーブ' },
  r_time: { en: 'Time', ja: 'タイム' },
  r_kills: { en: 'Military defeated', ja: '撃破した軍' },
  r_combo: { en: 'Best combo', ja: '最大コンボ' },
  r_level: { en: 'Level', ja: 'レベル' },
  r_evos: { en: 'Evolutions', ja: '進化' },
  resNew: { en: 'ENTER / SPACE — NEW RUN', ja: 'ENTER / SPACE — 新しいラン' },
  resEndlessGo: { en: 'E — KEEP RAMPAGING (ENDLESS)', ja: 'E — エンドレスで続ける' },
  h_rank: { en: 'Rank', ja: '順位' },
  h_name: { en: 'Name', ja: '名前' },
  h_score: { en: 'Score', ja: 'スコア' },
  h_result: { en: 'Result', ja: '結果' },
  h_date: { en: 'Date', ja: '日付' },
  allTime: { en: 'All time', ja: '総合' },
  today: { en: "Today's daily rampage", ja: '本日の大暴れ' },
  m_daily: { en: 'Daily rampage', ja: '本日の大暴れ' },
  dailyBadge: { en: 'DAILY RAMPAGE · {date}', ja: '本日の大暴れ · {date}' },
  dailyDesc: { en: 'Everyone gets the same city and the same upgrade rolls today.', ja: '今日は全員が同じ街、同じ強化の出方で遊ぶ。' },
  resVictoryShort: { en: 'Mech destroyed', ja: 'メカ撃破' },
  resWaveShort: { en: 'Wave {n}', ja: 'ウェーブ {n}' },
  resEndlessShort: { en: 'Endless wave {n}', ja: 'エンドレス {n}' },
  evolutions: { en: 'Evolutions', ja: '進化' },
  evoHow: {
    en: 'Max a weapon, own its paired mutation, then open a supply crate. Gold elites and the heavy walker drop crates.',
    ja: '武器を最大まで強化し、対応する変異を持った状態で補給物資を開けると進化する。金色の精鋭と重装ウォーカーが物資を落とす。',
  },
  evoNeeds: { en: 'max {w} + {p}', ja: '{w}（最大）+ {p}' },
  how_items: {
    en: 'Gold elites and the heavy walker drop supply crates: an upgrade, or an evolution. Also grab magnets, quake cores and rage.',
    ja: '金色の精鋭と重装ウォーカーは補給物資を落とす（強化か進化）。磁石・震源の石・激怒も拾おう。',
  },
  how_score: { en: 'Chain kills and destruction for a combo multiplier up to ×5. Beat the mech, then keep going in endless mode.', ja: '破壊と撃破を連鎖させるとコンボ倍率は最大×5。メカを倒したらエンドレスで続けられる。' },
  kind_evolution: { en: 'EVOLUTION', ja: '進化' },
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

// ── Evolutions ──
export const EVO_TEXT: Record<string, { glyph: string; en: { name: string; desc: string }; ja: { name: string; desc: string } }> = {
  gamma: {
    glyph: '滅',
    en: { name: 'Gamma Ray', desc: 'Atomic Breath evolved: a long sweeping beam at double damage.' },
    ja: { name: '滅びの光線', desc: '原子熱線の進化形。長く薙ぎ払う光線、ダメージ2倍。' },
  },
  typhoon: {
    glyph: '嵐',
    en: { name: 'Typhoon Tail', desc: 'Tail Spin evolved: spins constantly and drags enemies in.' },
    ja: { name: '台風尻尾', desc: '回転尻尾の進化形。絶えず回転し、敵を引き寄せる。' },
  },
  storm: {
    glyph: '雨',
    en: { name: 'Spine Storm', desc: 'Spine Volley evolved: a constant storm of piercing spines.' },
    ja: { name: '背びれの嵐', desc: '背びれ連射の進化形。貫通する背びれが降り注ぐ。' },
  },
  rend: {
    glyph: '裂',
    en: { name: 'Titan Rend', desc: 'Claws evolved: every swipe cuts all the way around you and sends out a shockwave.' },
    ja: { name: '巨神の裂爪', desc: '爪の進化形。全方位を切り裂き、衝撃波を放つ。' },
  },
  radiant: {
    glyph: '焔',
    en: { name: 'Radiant Core', desc: 'Fallout Aura evolved: a wide aura that heals you as it burns.' },
    ja: { name: '灼熱の光輪', desc: '放射能オーラの進化形。広がるオーラが焼くたびに体力を回復。' },
  },
};
export const evoName = (id: string) => EVO_TEXT[id]?.[lang].name ?? id;
export const evoDesc = (id: string) => EVO_TEXT[id]?.[lang].desc ?? '';
export const evoGlyph = (id: string) => EVO_TEXT[id]?.glyph ?? '?';
