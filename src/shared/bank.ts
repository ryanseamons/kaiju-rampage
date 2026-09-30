// The shipped news bank: the default source of every BREAKING NEWS card (no API key needed).
// Templates use {slots} filled from RunStats (see slotsFor). Any template that states a count
// is gated with `when` so the desk never reports "0 tanks destroyed".
// Tone: deadpan late-night broadcast that slides into panic. Fictional city, no real people.
import type { RunStats, Tier } from './narration';

type Outcome = RunStats['outcome'];
export interface Template {
  t: string;
  when?: (s: RunStats) => boolean;
  outcomes?: Outcome[]; // default: ['wave-cleared']
  tiers?: Tier[]; // default: any
}

const tpl = (t: string, when?: Template['when'], extra: Omit<Template, 't' | 'when'> = {}): Template => ({ t, when, ...extra });
const tier = (n: Tier, t: string, when?: Template['when']) => tpl(t, when, { tiers: [n] });
const win = (t: string, when?: Template['when']) => tpl(t, when, { outcomes: ['victory'] });
const loss = (t: string, when?: Template['when']) => tpl(t, when, { outcomes: ['defeat'] });
/** Fits any card, including victory/defeat. */
const any = (t: string, when?: Template['when']) => tpl(t, when, { outcomes: ['wave-cleared', 'victory', 'defeat'] });

// Common gates
const B = (s: RunStats) => s.buildingsDestroyed > 0;
const WB = (s: RunStats) => s.waveBuildingsDestroyed > 0;
const H = (s: RunStats) => s.housesDestroyed > 0;
const TW = (s: RunStats) => s.towersDestroyed > 0;
const C = (s: RunStats) => s.carsCrushed > 0;
const SO = (s: RunStats) => s.soldiersDefeated > 0;
const TK = (s: RunStats) => s.tanksDestroyed > 0;
const ND = (s: RunStats) => s.nearDeathMoments > 0;
const UNSCATHED = (s: RunStats) => s.nearDeathMoments === 0 && s.lowestHpPct >= 50;
const UP = (s: RunStats) => s.newUpgradesThisWave.length > 0;
const ST = (s: RunStats) => s.stompsUsed > 0;
const QUIET = (s: RunStats) => s.waveBuildingsDestroyed < 5;
const BIG = (s: RunStats) => s.waveBuildingsDestroyed >= 25;
const MOVED = (s: RunStats) => s.district !== s.hardestHitDistrict;
const all = (...fs: ((s: RunStats) => boolean)[]) => (s: RunStats) => fs.every((f) => f(s));

// ── Headlines (rendered in caps) ─────────────────────────────────────────────
export const HEADLINES: Template[] = [
  tpl('{kaiju} levels {hardest}', WB),
  tpl('{buildingsN} and counting', B),
  tpl('Military "regrouping," sources say'),
  tpl('Wave {wave}: city still standing (mostly)'),
  tpl('Monster seen in {district}'),
  tpl('{hardest} asks: why us?', WB),
  tpl('Army pulls back for "snack break"'),
  tpl('Evacuation now "strongly encouraged"'),
  tpl('Creature shows no sign of leaving'),
  tpl('Experts: this is bad', BIG),
  tpl('Quiet wave, nervous city', QUIET),
  tpl('{towersN} fall across the skyline', TW),
  tpl('Armor losses mount: {tanksN} down', TK),
  tpl('New ability reported: {upgrade}', UP),
  tpl('Monster wounded, not stopped', ND),
  tpl('Seismic alert after {stompsN}', ST),
  tpl('Traffic update: {carsN} flattened', C),
  tier(1, 'Small monster, big problem'),
  tier(1, 'Officials downplay "lizard incident"'),
  tier(1, 'Pest control called in, pest wins'),
  tier(2, 'It is getting bigger'),
  tier(2, 'Houses no longer considered safe'),
  tier(2, 'Behemoth-class threat confirmed'),
  tier(3, 'Skyline reported missing'),
  tier(3, 'City-ender stalks {district}'),
  tier(3, 'Towers now optional, says monster'),
  win('{kaiju} destroys flagship mech'),
  win('Shiokaze Guardian falls'),
  win('City surrenders to lizard'),
  win('Mech down, monster up'),
  loss('{kaiju} down; city exhales'),
  loss('Monster falls in {district}'),
  loss('Military claims victory, checks twice'),
  loss('Beast collapses after {minutes} minutes'),
];

// ── Anchor lines (one spoken sentence) ───────────────────────────────────────
export const ANCHORS: Template[] = [
  // general destruction
  tpl('Good evening. {kaiju} has now destroyed {buildingsN}, and residents of {hardest} are asking whether "regrouping" is a military word for running.', B),
  tpl('Tonight\'s top story remains the same as the last one: a monster, a city, and {buildingsN} that used to be buildings.', B),
  tpl('Wave {wave} is over, and the official damage estimate has been replaced with a single, long sigh.', B),
  tpl('The city council met in emergency session tonight and voted unanimously to stop counting after {buildingsN}.', B),
  tpl('In the last wave alone, {waveBuildingsN} came down across Shiokaze Bay — a new record nobody wanted.', WB),
  tpl('Our helicopter crew reports {hardest} is "mostly dust with a view."', WB),
  tpl('We are receiving footage from {hardest}; we will not be airing it, because it is just rubble, and you have seen rubble.', WB),
  tpl('If you are watching this from {hardest}, please stop watching and start leaving.', WB),
  tpl('Insurance adjusters in {hardest} have been seen crying openly in the street.', WB),
  tpl('Authorities describe the damage as "architectural," which our editors assure us is not a real category.', B),
  tpl('Good evening, or what remains of it. The monster remains in {district}; the buildings, largely, do not.', B),
  tpl('The Defense Ministry has released a map of safe zones; it is a blank piece of paper.', B),
  tpl('The Bureau of Urban Planning confirms {buildingsN} are now considered "open-plan."', B),
  tpl('To viewers just joining us: yes, it is still happening, and yes, it has gotten worse.', B),
  tpl('The creature appears to have a system: step, crunch, roar, repeat.', B),
  tpl('A reminder that the harbor was once the pride of Shiokaze Bay. It is now the pride of {kaiju}.', B),
  tpl('Wave {wave} ends with {waveBuildingsN} lost; the army promises wave {nextWave} will "go differently."', WB),
  tpl('We asked a structural engineer for comment; she pointed at the window and left.', B),
  tpl('Shiokaze Bay\'s tourism board has quietly changed its slogan to "Visit While You Can."', B),
  tpl('For those keeping score at home: city, not great; monster, excellent.', B),
  tpl('Emergency crews have given up on sirens and are now simply pointing.', BIG),
  tpl('That was the most destructive wave yet; our weather map now shows a small lizard where Downtown used to be.', BIG),
  // district
  tpl('We go live to {district}, where the creature appears to be enjoying itself.'),
  tpl('The creature has moved on to {district}; {hardest}, for now, can exhale.', MOVED),
  tpl('Residents of {district} report a large shadow, a smell of the sea, and then a very loud noise.'),
  tpl('{district} has been placed under a "please be somewhere else" advisory.'),
  tpl('Real estate agents in {district} describe the market as "extremely flat, literally."'),
  tpl('Our reporter in {district} is filing by carrier pigeon; the pigeon is also leaving.'),
  tpl('Police in {district} have closed several streets, and the monster has closed several more.'),
  tpl('Schools in {district} are closed tomorrow, and possibly also in the architectural sense.'),
  tpl('Last seen heading through {district}, the creature is described as "large, green and not stopping."'),
  tpl('A {district} shopkeeper tells us she has seen worse; our fact-checkers are still looking for when.'),
  tpl('{district} commuters are advised to expect delays of "until further notice."'),
  tpl('Air-raid sirens in {district} have been sounding for so long that pigeons have started to harmonize.'),
  // tier 1
  tier(1, 'Officials continue to describe the creature as "roughly van-sized" and "honestly kind of cute."'),
  tier(1, 'The Defense Ministry insists this is a pest-control problem; the pests insist otherwise.'),
  tier(1, 'The creature is currently {size}, and is eating cars as if it plans to be much bigger.'),
  tier(1, 'Parents are advised to keep small children and small hatchbacks indoors.'),
  tier(1, 'Experts say the creature will likely grow; experts also say that is a problem for later.'),
  tier(1, 'It is small, it is fast, and it has already filed a noise complaint with the harbor.'),
  tier(1, 'Infantry units report the target is "hard to hit, easy to underestimate."'),
  tier(1, 'A spokesperson called it "a lizard with ambitions." We will be watching those ambitions.'),
  tier(1, 'For now the city\'s houses are safe, a sentence we suspect will age poorly.'),
  tier(1, 'Scientists are calling it a hatchling, which raises the question of where the parents are.'),
  // tier 2
  tier(2, 'The creature is now {size}, and suburban roofs are officially a snack.'),
  tier(2, 'Armored divisions have arrived, and the creature has noticed them, which is the bad part.'),
  tier(2, 'Behemoth-class, officials say, which we are told is one word above "oh no."'),
  tier(2, 'It crushed houses tonight like they were cardboard; they were not cardboard.'),
  tier(2, 'Remember when it was the size of a van? Those were simpler times.'),
  tier(2, 'The threat level has been raised to "regional emergency," and lowered again only in morale.'),
  tier(2, 'Neighbours report the creature\'s footsteps now register on home bathroom scales.'),
  tier(2, 'The tanks are taking it seriously now, which experts agree is too late.'),
  tier(2, 'Its growth has been described as "rapid, sustained and very rude."'),
  tier(2, 'Towers still stand for now, a fact the creature seems to be working on.'),
  // tier 3
  tier(3, 'The creature is now {size}; the city\'s tallest towers come up to roughly its knee.'),
  tier(3, 'Officials have upgraded the threat to "existential" and downgraded their optimism to "none."'),
  tier(3, 'Towers are falling like dominoes, if dominoes had elevators and a gift shop.'),
  tier(3, 'Air traffic control has rerouted all flights around the monster\'s head.'),
  tier(3, 'Tanks are now, and we quote a field commander, "speed bumps with opinions."'),
  tier(3, 'Satellites have begun tracking the creature, mostly out of respect.'),
  tier(3, 'The city is no longer being defended so much as apologized for.'),
  tier(3, 'It has become a city-ender, a phrase the Ministry printed on a pamphlet and then shredded.'),
  tier(3, 'At this size, the creature\'s shadow alone has closed three parks.'),
  tier(3, 'Downtown\'s skyline has been redrawn, by a lizard, with its feet.'),
  // military
  tpl('Officials insist the situation is under control, though {tanksN} and {soldiersN} might disagree.', all(TK, SO)),
  tpl('The army reports {soldiersN} "tactically relocated," mostly at a sprint.', SO),
  tpl('{tanksN} were lost tonight; the ministry has asked the public to stop calling them "crunchy."', TK),
  tpl('Military command says morale is high, which is technically true of the monster.', SO),
  tpl('Infantry units have been issued new orders: fire, then run, then keep running.', SO),
  tpl('A tank commander described the engagement as "brief, loud and very one-sided."', TK),
  tpl('The Defense Ministry is requesting more tanks, having recently misplaced {tanksN}.', TK),
  tpl('Soldiers on the ground say the creature fights "like it has read the manual and disagreed."', SO),
  tpl('The army has fallen back to a new defensive line, which the creature has already walked through.', SO),
  tpl('Brass at headquarters are said to be reviewing tonight\'s tactics, and possibly their careers.', all(SO, TK)),
  tpl('The military promises a "decisive response" in wave {nextWave}; the last one was also decisive, for the monster.', SO),
  tpl('Troops report their rifles are "mostly decorative" at this point.', (s) => SO(s) && s.tier >= 2),
  // near death
  tpl('For a moment the creature was down to {lowest}% strength. Then, witnesses say, it got angry.', ND),
  tpl('The military briefly declared victory tonight; the retraction was issued forty seconds later.', ND),
  tpl('Our sources say the army had the creature on the ropes {nearDeathN}. The ropes have since been eaten.', ND),
  tpl('Analysts say the creature is "not invincible, just extremely rude about it."', ND),
  tpl('At its weakest the beast dropped to {lowest}% — and then flattened the building it was leaning on.', ND),
  tpl('Military planners are said to be studying the moment it nearly fell, mostly with their heads in their hands.', ND),
  tpl('The creature looked wounded tonight, which, frankly, only made it worse.', ND),
  tpl('Doctors confirm the monster was hurt; they declined to say by whom, or how they would know.', ND),
  tpl('After wave {wave}, the military has yet to leave a real scratch. Experts recommend "being somewhere else."', UNSCATHED),
  tpl('The army\'s best efforts have so far produced a creature at {hp}% health and a very long invoice.', UNSCATHED),
  tpl('Remarkably, the creature has barely been touched, which our analysts call "the worst-case scenario."', UNSCATHED),
  // upgrades
  tpl('Eyewitnesses describe a new ability tonight: {upgrade}. Our science desk would like to lie down.', UP),
  tpl('Just when we thought we understood it, the creature unveiled {upgrade}.', UP),
  tpl('Scientists are baffled by the creature\'s {upgrade}; the creature seems less baffled.', UP),
  tpl('The monster is adapting. Tonight\'s adaptation: {upgrade}. Tomorrow\'s: unknown, and we are scared.', UP),
  tpl('Footage appears to show {upgrade} in action. We have slowed it down; it did not help.', UP),
  tpl('The Ministry says it has "a counter for {upgrade}," and asked us not to follow up.', UP),
  tpl('Every wave it learns something new; this time, {upgrade}. The military is learning to duck.', UP),
  tpl('Experts now list the creature\'s abilities as {upgradeList}. The list is getting long.', (s) => s.upgrades.length >= 3),
  // stomps
  tpl('Seismologists have logged {stompsN}; they have also logged their resignations.', ST),
  tpl('Every stomp registers across the bay; fishermen report the fish have left too.', ST),
  tpl('The creature\'s stomps have been felt as far as the next prefecture, which has sent a strongly worded letter.', ST),
  tpl('Residents are asked to secure loose items, including, apparently, their entire neighbourhood.', ST),
  // quiet
  tpl('A relatively quiet wave, with only {waveBuildingsN} lost; nobody believes it will last.', all(QUIET, WB)),
  tpl('The creature spent this wave mostly eating cars, which officials are calling "a good sign," for some reason.', all(QUIET, C)),
  tpl('Calm returns to Shiokaze Bay, in the way a held breath is calm.', QUIET),
  tpl('Few buildings fell tonight; analysts suspect the creature is saving its energy, which is worse.', QUIET),
  tpl('Wave {wave} ends with the city largely intact, and the monster very much awake.', QUIET),
  // vehicles
  tpl('Breaking tonight: {carsN} crushed, and the mayor has stopped answering the phone.', C),
  tpl('Parking enforcement reports {carsN} now in violation of every regulation at once.', C),
  tpl('The bay\'s traffic report is simple tonight: the traffic is gone, and so are the roads.', C),
  // victory
  win('The flagship mech is down. Shiokaze Bay belongs to {kaiju} now, and it knows it.'),
  win('The military\'s last hope lies in pieces across {district}; the creature is, we believe, smiling.'),
  win('In {minutes} minutes the creature went from van-sized nuisance to the undisputed owner of this city.'),
  win('With the Guardian mech destroyed, officials have one recommendation left: move.'),
  win('After {buildingsN} and one very large robot, the creature stands alone on the skyline.', B),
  win('We are told the mech cost more than the harbor. The harbor, for the record, is also gone.'),
  win('It is over. The monster won. We\'ll be back after this, assuming there is an after.'),
  win('The Defense Ministry has issued its final statement tonight: a single word, "wow."'),
  // defeat
  loss('After {minutes} minutes of chaos, the creature has collapsed in {district} and is not moving.'),
  loss('The military is cautiously declaring victory, and very cautiously standing well back.'),
  loss('{kaiju} has fallen, but not before it took {buildingsN} with it.', B),
  loss('The creature is down. The city is quiet. Nobody in this studio is breathing normally yet.'),
  loss('Crews approach the fallen beast in {district}; one soldier reportedly poked it and immediately regretted it.'),
  loss('It came from the bay, it grew, it smashed — and tonight, finally, it stopped.'),
  loss('Officials remind citizens that the creature is "almost certainly" not sleeping.'),
  loss('Shiokaze Bay survives. Barely. We will be counting the damage for years.'),
];

// ── Ticker fragments (rendered in caps) ──────────────────────────────────────
export const TICKERS: Template[] = [
  tpl('{hardest} residents urged to evacuate "immediately, or sooner"', WB),
  tpl('Defense ministry: {soldiersN} "reassigned to running away"', SO),
  tpl('Seismologists log {stompsN}; Richter scale files complaint', ST),
  any('Insurers redefine "act of god" to include {kaiju}'),
  tpl('Traffic update: {carsN} now significantly flatter', C),
  tpl('City planners call {towersN} lost "an opportunity"', TW),
  tpl('Ferry service suspended, ferry also suspended in a building'),
  any('Local noodle shop stays open: "we\'ve seen worse"'),
  tpl('Size estimate revised: {size}'),
  tpl('Armored divisions report {tanksN} "temporarily upside down"', TK),
  any('Weather: clear skies, scattered debris, chance of roar'),
  tpl('Eyewitnesses describe new ability: "{upgrade}"', UP),
  tpl('Scientists baffled by creature\'s {upgrade}', UP),
  tpl('Military briefly declares victory at {lowest}% — retracts statement', ND),
  tpl('Wave {wave} damage: {waveBuildingsN}', WB),
  tpl('{buildingsN} destroyed since first sighting', B),
  tpl('Creature last seen in {district}'),
  tpl('Threat level: {threat}'),
  any('Mayor\'s office: "please stop calling"'),
  any('Harbor authority reports harbor "mostly theoretical"'),
  tpl('Bus routes through {district} cancelled for the foreseeable future'),
  tpl('Rubble collection moved from weekly to hourly'),
  tpl('Hardware stores report record sales of helmets, run on sandbags'),
  tpl('Bay-side hotels offer "monster view" rooms at a discount'),
  any('Lost and found now accepting entire buildings'),
  tpl('Streetlights in {district} "flickering nervously"'),
  tpl('Pigeons evacuate {district} ahead of residents'),
  any('Karaoke bars remain open; song requests trend toward farewells'),
  tpl('Sirens now audible from space, says observatory'),
  any('Emergency hotline wait time: "yes"'),
  any('Children\'s drawings of creature now outnumber drawings of cats'),
  tpl('Garbage collection postponed; garbage no longer distinguishable from city'),
  any('Toy stores sell out of green lizard plushies'),
  any('Scientists request a name more scientific than "{kaiju}"; request denied'),
  any('Stock market: shares in rubble up 400%'),
  tpl('Parks department reclassifies {district} as "open space"'),
  tpl('Real estate listings updated to include "has been stepped on"'),
  any('Fishing fleet stays in port: "the fish know something"'),
  tpl('Night markets close early, reopen "somewhere else, maybe"'),
  tpl('Shiokaze tower observation deck now at ground level', TW),
  tpl('Elevator repair companies face "fundamental" challenges', TW),
  tpl('Window cleaners\' union declares work "no longer applicable"', TW),
  tpl('{towersN} toppled; skyline postcards recalled', TW),
  tpl('Rooftop gardens relocated to street level, involuntarily', TW),
  tpl('{housesN} flattened; homeowners told to "think of it as a patio"', H),
  tpl('Neighbourhood watch disbanded: "we watched"', H),
  tpl('Housing ministry: {housesN} lost, several more "wobbly"', H),
  tpl('Garden gnome survives collapse of entire street', H),
  tpl('Parking fines waived for all {carsN} currently inside the monster', C),
  tpl('Car dealerships report "unexpected downsizing" of inventory', C),
  tpl('Rush hour cancelled; rush remains', C),
  tpl('Tow trucks overwhelmed, then towed', C),
  tpl('{tanksN} lost; ministry requests tanks "with more armor, or legs"', TK),
  tpl('Tank crews request hazard pay, or a better plan', TK),
  tpl('Army surplus store now stocking "slightly crushed" tanks', TK),
  tpl('Infantry ordered to "hold the line," line has left', SO),
  tpl('{soldiersN} routed; drill sergeants "very disappointed"', SO),
  tpl('Military recruitment booth in {district} closes, recruiter also running', SO),
  tpl('Ammunition shortage reported; monster unimpressed by remaining ammunition', SO),
  tpl('Creature now {size}; scientists recommend bigger rulers'),
  tpl('Growth rate described as "alarming," "unprecedented," and "rude"'),
  tpl('Seismic sensors in {district} report "yes"', ST),
  tpl('Earthquake insurance claims spike after {stompsN}', ST),
  tpl('Cracked teacups reported city-wide after latest stomp', ST),
  tpl('Near-death count: {nearDeathN}. Military: "so close"', ND),
  tpl('Creature bled, briefly; did not care', ND),
  tpl('Army had it at {lowest}%. Past tense.', ND),
  tpl('Creature has shrugged off everything the army has; analysts suggest "a bigger army"', UNSCATHED),
  tpl('Military score so far: zero serious wounds', UNSCATHED),
  tpl('New ability logged: {upgrade}; old abilities still also bad', UP),
  tpl('Ministry adds {upgrade} to list of "things we did not plan for"', UP),
  tpl('Creature abilities now include: {upgradeList}', (s) => s.upgrades.length >= 2),
  tpl('Wave {nextWave} expected shortly; residents asked to "brace, then run"'),
  tpl('Army promises wave {nextWave} will be "the one"'),
  tpl('Military regroups north of {district}; creature notices'),
  tpl('Evacuation buses running late, running scared'),
  tpl('Emergency broadcast system asks citizens to stay calm, then screams'),
  tpl('Coast guard: "the bay is closed, the bay is angry"'),
  tpl('Lighthouse keeper refuses to leave, lighthouse leaves without him'),
  tpl('City hall moves to temporary location: a van, moving quickly'),
  tpl('Blood drives open city-wide; creature not eligible'),
  tpl('Public transit reports record ridership, all of it leaving'),
  tpl('Weather service adds "falling masonry" to forecast'),
  tpl('Sports fixtures postponed; stadium "currently a crater"', BIG),
  tpl('Streets renamed for convenience: "Rubble Road," "Crater Avenue"', BIG),
  tpl('Wave {wave} ranked most destructive yet', BIG),
  tpl('Relative calm this wave; city "suspicious"', QUIET),
  tpl('Only {waveBuildingsN} lost this wave; officials cautiously optimistic, then not', all(QUIET, WB)),
  any('Local cat declines to evacuate, remains unbothered'),
  any('Anchor desk requests hazard pay; request under review'),
  any('Studio lights flickering; we are fine; we are totally fine'),
  tpl('Viewers asked to stop sending footage; we have seen enough'),
  tpl('This ticker will continue for as long as the ticker does'),
  tpl('Reminder: do not approach the creature. Do not feed the creature. It feeds itself.'),
  tpl('Radio stations switch to "calming music," creature appears to like it'),
  tpl('Convenience stores stay open 24/7, as usual, bravely'),
  any('Vending machines report record sales of canned coffee'),
  any('Weather radar detects a large green object; it is not weather'),
  tpl('Historic district now considerably more historic', WB),
  tpl('{hardest} named "most flattened district" for wave {wave}', WB),
  any('Architecture critics call {kaiju}\'s work "bold, brutalist, final"', B),
  tier(1, 'Pest control fleet dispatched; pest control fleet eaten'),
  tier(1, 'Officials: creature "manageable," "small," "stop laughing"'),
  tier(1, 'Hatchback owners advised to park indoors'),
  tier(1, 'Zoo denies losing anything, checks again'),
  tier(2, 'Suburban roofs officially reclassified as snacks'),
  tier(2, 'Tanks deployed; tanks nervous'),
  tier(2, 'Houses "no longer considered load-bearing"'),
  tier(2, 'Behemoth-class alert issued across the prefecture'),
  tier(3, 'City-ender class confirmed; no class above it, officials say'),
  tier(3, 'Aviation authority adds creature to charts as a mountain'),
  tier(3, 'Towers now considered "decorative"'),
  tier(3, 'Neighbouring prefecture reports creature visible from its balconies'),
  win('Flagship mech destroyed; engineers "going back to the drawing board," drawing board also destroyed'),
  win('Military formally cedes Shiokaze Bay to lizard'),
  win('Mech pilot safe, reportedly "done with all this"'),
  win('Creature unopposed; city waits to see what it wants'),
  win('{buildingsN} destroyed; one very large robot also destroyed', B),
  loss('Creature down in {district}; do not approach'),
  loss('Army declares victory, keeps weapons pointed at it anyway'),
  loss('Scientists request samples; nobody volunteers'),
  loss('Cleanup expected to take "a generation or two"'),
  loss('{buildingsN} lost before the creature fell', B),
];

// ── Slots ────────────────────────────────────────────────────────────────────
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

export function slotsFor(s: RunStats, ctx: { kaiju: string; size: string; threat: string }): Record<string, string> {
  return {
    kaiju: ctx.kaiju,
    district: s.district,
    hardest: s.hardestHitDistrict,
    size: ctx.size,
    threat: ctx.threat,
    wave: String(s.wave),
    nextWave: String(Math.min(s.wave + 1, s.totalWaves)),
    minutes: String(Math.max(1, Math.round(s.elapsedSec / 60))),
    lowest: String(s.lowestHpPct),
    hp: String(s.hpPct),
    buildingsN: plural(s.buildingsDestroyed, 'building', 'buildings'),
    waveBuildingsN: plural(s.waveBuildingsDestroyed, 'building', 'buildings'),
    housesN: plural(s.housesDestroyed, 'home', 'homes'),
    towersN: plural(s.towersDestroyed, 'tower', 'towers'),
    carsN: plural(s.carsCrushed, 'vehicle', 'vehicles'),
    soldiersN: plural(s.soldiersDefeated, 'soldier', 'soldiers'),
    tanksN: plural(s.tanksDestroyed, 'tank', 'tanks'),
    stompsN: plural(s.stompsUsed, 'stomp', 'stomps'),
    nearDeathN: times(s.nearDeathMoments),
    upgrade: s.newUpgradesThisWave[s.newUpgradesThisWave.length - 1] ?? '',
    upgradeList: s.upgrades.slice(-4).join(', '),
  };
}

export function render(t: string, slots: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots && slots[k] !== '' ? slots[k] : m));
}

export function eligible(list: Template[], s: RunStats): Template[] {
  return list.filter(
    (x) => (x.outcomes ?? ['wave-cleared']).includes(s.outcome) && (!x.tiers || x.tiers.includes(s.tier)) && (!x.when || x.when(s)),
  );
}
