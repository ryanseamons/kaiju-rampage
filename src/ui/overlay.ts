// The front page and its menus, as HTML over the canvas (pattern borrowed from the tavern project).
// The layer is sized to the canvas's letterboxed rectangle so the poster lines up at any window size.
import { evoDesc, evoGlyph, evoName, getLang, onLang, setLang, t, upDesc, upGlyph, upName } from '../i18n';
import { EVOLUTIONS, UPGRADES, type UpgradeDef } from '../upgrades';
import { loadBoard, loadDaily, type ScoreEntry } from '../scores';
import { DAILY, todayKey } from '../config';
import { DIFFICULTIES, cycleDifficulty, difficultyId, difficultyLocked, setDifficulty, type DifficultyId } from '../difficulty';
import { music } from '../audio/music';
import { duckMusic, isRunning, onAudioReady, prefs, setMusicOn, setSfxOn, toggleMuted, unlock } from '../audio/core';
import { tracks } from '../audio/tracks';
import { uiSound } from '../audio/ui-sounds';

const SPEAKER_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

type Panel = null | 'how' | 'codex' | 'scores' | 'settings' | 'sound';
const STAGES = ['title', 'tier1', 'tier2', 'tier3', 'boss', 'victory', 'defeat'] as const;
const VOTES_KEY = 'kaiju.trackVotes';
type Vote = 'keep' | 'cut';
function loadVotes(): Record<string, Vote> {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveVotes(v: Record<string, Vote>) {
  try {
    localStorage.setItem(VOTES_KEY, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}
type Item = 'start' | 'daily' | 'how' | 'codex' | 'scores' | 'settings';
const ITEMS: Item[] = ['start', 'daily', 'how', 'codex', 'scores', 'settings'];
const KIND_COLOR: Record<UpgradeDef['kind'], string> = { weapon: '#ff7a2a', body: '#56c46a', stomp: '#5ff6ff', growth: '#ff5fd2' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

class Overlay {
  private root!: HTMLElement;
  private open = false;
  private panel: Panel = null;
  private sel = 0;
  private openedAt = 0;
  private onStart: () => void = () => {};
  private monsterBody: string | null = null;
  private monsterGlow: string | null = null;
  private plaqueTimer: number | null = null;
  /** True until the first render after show(): only then do the poster's entrance animations play. */
  private entrance = true;
  /** The panel currently in the DOM, so re-rendering it (a settings toggle) doesn't replay its pop-in. */
  private shownPanel: Panel = null;

  init(onStart: () => void) {
    this.onStart = onStart;
    this.root = document.getElementById('overlay')!;
    const place = () => this.place();
    window.addEventListener('resize', place);
    new ResizeObserver(place).observe(document.getElementById('game')!);
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    // The first gesture anywhere unlocks audio and starts the title theme.
    const wake = () => {
      unlock();
      if (this.open) music.play('title');
    };
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
    onLang(() => this.open && this.render());
    // The Sound Test highlights what's playing; keep it current when a track rotates on its own.
    music.onChange(() => this.syncSoundNow());
    void tracks.load().then(() => this.open && this.panel === 'sound' && !this.root.querySelector('.track') && this.renderPanel());
    onAudioReady(() => uiSound.preload());
    // Hover + press sounds for every HTML button (menu, panels, pills, the mute button).
    let lastBtn: Element | null = null;
    document.addEventListener('pointerover', (e) => {
      const b = (e.target as Element | null)?.closest?.('#overlay button, #mute, #pause');
      if (b && b !== lastBtn) uiSound.hover();
      lastBtn = b ?? null;
    });
    document.addEventListener('pointerdown', (e) => {
      if ((e.target as Element | null)?.closest?.('#overlay button, #mute, #pause')) uiSound.press();
    }, true);
    // The mute button lives outside the poster so it is there during play too. M does the same.
    const mute = document.getElementById('mute') as HTMLButtonElement;
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      const nowMuted = toggleMuted();
      this.syncMute();
      if (!nowMuted) uiSound.press(); // audible confirmation on unmute
      mute.blur();
    });
    // The pause button (beside mute) is for mouse and touch players; the game listens for the event.
    const pause = document.getElementById('pause') as HTMLButtonElement;
    pause.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new Event('kaiju-pause'));
      pause.blur();
    });
    window.setInterval(() => this.syncMute(), 250);
    this.syncMute();
  }

  private syncMute() {
    const b = document.getElementById('mute');
    if (!b) return;
    const m = prefs.muted;
    if (b.dataset.m === String(m)) return;
    b.dataset.m = String(m);
    b.innerHTML = m ? SPEAKER_OFF : SPEAKER_ON;
    b.classList.toggle('muted', m);
    b.setAttribute('aria-label', m ? 'Unmute (M)' : 'Mute (M)');
    b.title = m ? 'Unmute (M)' : 'Mute (M)';
    b.setAttribute('aria-pressed', String(m));
  }

  /** Tint the game's own kaiju sprite into a silhouette plus a glow layer for the poster. */
  setMonster(src: HTMLCanvasElement | HTMLImageElement) {
    const w = src.width, h = src.height;
    const read = document.createElement('canvas');
    read.width = w;
    read.height = h;
    const rc = read.getContext('2d', { willReadFrequently: true })!;
    rc.drawImage(src, 0, 0);
    const data = rc.getImageData(0, 0, w, h);
    const body = rc.createImageData(w, h);
    const glow = rc.createImageData(w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      if (!data.data[i + 3]) continue;
      const [r, g, b] = [data.data[i], data.data[i + 1], data.data[i + 2]];
      const y = Math.floor(i / 4 / w);
      const spine = b > 200 && g > 200 && r < 140;
      const eye = r > 220 && b < 100;
      const shade = 10 + Math.round((1 - y / h) * 16);
      body.data.set([shade, shade + 6, shade + 20, 255], i);
      if (spine) glow.data.set([95, 246, 255, 255], i);
      if (eye) glow.data.set([255, 70, 70, 255], i);
    }
    const out = (img: ImageData) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.putImageData(img, 0, 0);
      return c.toDataURL();
    };
    this.monsterBody = out(body);
    this.monsterGlow = out(glow);
    if (this.open) this.render();
  }

  isOpen() {
    return this.open;
  }

  show() {
    this.open = true;
    this.panel = null;
    this.sel = 0;
    this.openedAt = performance.now();
    this.entrance = true;
    this.shownPanel = null;
    this.root.hidden = false;
    duckMusic(false); // a run that ended on the results screen left the music ducked
    document.getElementById('pause')?.toggleAttribute('hidden', true);
    this.place();
    this.render();
    if (isRunning()) music.play('title');
    if (this.plaqueTimer === null) this.plaqueTimer = window.setInterval(() => this.updatePlaque(), 200);
  }

  hide() {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    document.getElementById('pause')?.toggleAttribute('hidden', false);
    if (this.plaqueTimer !== null) clearInterval(this.plaqueTimer);
    this.plaqueTimer = null;
  }

  private place() {
    const canvas = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.root) return;
    const r = canvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.root.style.setProperty('--u', `${r.width / 80}px`);
    const mute = document.getElementById('mute');
    if (mute) {
      const size = Math.max(32, Math.min(48, r.width / 30));
      Object.assign(mute.style, { left: `${r.right - size - r.width * 0.012}px`, top: `${r.bottom - size - r.height * 0.05}px` });
      mute.style.setProperty('--mb', `${size}px`);
      const pause = document.getElementById('pause');
      if (pause) {
        Object.assign(pause.style, { left: `${r.right - 2 * size - r.width * 0.012 - size * 0.3}px`, top: mute.style.top });
        pause.style.setProperty('--mb', `${size}px`);
      }
    }
  }

  /** `fromKey`: ignore an Enter that carried over from the previous screen. */
  private start(fromKey = false) {
    if (fromKey && performance.now() - this.openedAt < 250) return;
    unlock();
    this.hide();
    this.onStart();
  }

  private activate(item: Item, fromKey = false) {
    if (item === 'start') return this.start(fromKey);
    if (item === 'daily') {
      // The daily seed is read at load time, so the daily run is a fresh page with ?daily=1.
      const q = new URLSearchParams(location.search);
      if (DAILY) q.delete('daily');
      else q.set('daily', '1');
      location.search = q.toString();
      return;
    }
    this.panel = item;
    this.renderPanel();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open) return;
    const code = e.code;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (code === 'KeyM') return; // UIScene handles mute
    if (code === 'KeyL') {
      handled();
      setLang(getLang() === 'en' ? 'ja' : 'en');
      return;
    }
    if (this.panel) {
      if (code === 'Escape' || code === 'Backspace' || code === 'Enter' || code === 'Space') {
        handled();
        uiSound.press();
        this.panel = null;
        this.renderPanel();
      }
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      handled();
      if (difficultyLocked()) return;
      const back = code === 'ArrowLeft' || code === 'KeyA';
      if (back) setDifficulty(DIFFICULTIES[(DIFFICULTIES.indexOf(difficultyId()) + DIFFICULTIES.length - 1) % DIFFICULTIES.length]);
      else cycleDifficulty();
      uiSound.hover(false);
      this.renderDifficulty();
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      handled();
      this.sel = (this.sel + 1) % ITEMS.length;
      uiSound.hover(false);
      this.syncSel();
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      handled();
      this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
      uiSound.hover(false);
      this.syncSel();
    } else if (code === 'Enter' || code === 'Space') {
      handled();
      uiSound.press();
      this.activate(ITEMS[this.sel], true);
    }
  }

  /** Gamepad / external input from the game (UIScene forwards pad presses). */
  press(code: 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Escape') {
    this.onKey(new KeyboardEvent('keydown', { code }));
  }

  private render() {
    if (!this.root) return;
    const top = (DAILY ? loadDaily(DAILY) : loadBoard())[0];
    const bestLine = top ? `${esc(DAILY ? t('today') : t('bestRun'))}: ${top.score.toLocaleString()} · ${esc(top.name)} · ${esc(this.resultShort(top))}` : '';
    const labels: Record<Item, string> = {
      start: t('m_start'), daily: DAILY ? `${t('m_daily')} ✓` : t('m_daily'), how: t('m_how'), codex: t('m_codex'), scores: t('m_scores'), settings: t('m_settings'),
    };
    const menu = ITEMS.map(
      (it, i) =>
        `<button data-item="${it}" class="${it === 'start' ? 'primary' : ''} ${i === this.sel ? 'sel' : ''}"><span class="n">0${i + 1}</span>${esc(labels[it])}</button>`,
    ).join('');
    const monster = this.monsterBody
      ? `<div class="monster-wrap"><img class="monster" src="${this.monsterBody}" alt=""><img class="spine-glow" src="${this.monsterGlow}" alt=""></div>`
      : '';
    this.root.innerHTML = `
      <div class="poster">
        ${monster}
        <div class="vertical">潮風湾大災害</div>
        <div class="kicker">${DAILY ? esc(t('dailyBadge', { date: DAILY })) : getLang() === 'ja' ? 'KBN-7 報道部 提供' : 'KBN-7 NIGHT DESK PRESENTS'}</div>
        <h1 class="logo" aria-label="Kaiju Rampage"><span>KAIJU</span><span>RAMPAGE</span></h1>
        <div class="seal" aria-hidden="true"><b>怪</b></div>
        <div class="jp-title" lang="ja">怪獣大暴れ</div>
        <div class="tagline">${esc(t('tagline'))}</div>
        <div class="pitch">${esc(t('pitch'))}</div>
        <div class="teaser">${esc(t('kaijuTeaser'))}</div>
        <nav class="menu">${menu}</nav>
        ${this.difficultyHtml()}
        <div class="best">${bestLine}</div>
        <div class="controls">
          <div class="pill" role="group" aria-label="${esc(t('s_language'))}">
            <button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button>
            <button data-lang="ja" class="jp ${getLang() === 'ja' ? 'on' : ''}">日本語</button>
          </div>
        </div>
        <div class="plaque silent" role="button" tabindex="0" title="${esc(t('soundOpen'))}">
          <div class="label"><span class="eq"><b></b><b></b><b></b></span>${esc(t('nowPlaying'))}</div>
          <div class="title"></div>
          <div class="meta"></div>
          <div class="bar"><i></i></div>
        </div>
        <div class="keyhint">${esc(t('keyHint'))}</div>
        <div class="credits">${esc(t('credits'))}</div>
      </div>
      <div class="panel-slot"></div>`;
    // Later full renders (language switch, monster art arriving) must not replay the entrance.
    this.root.classList.toggle('settled', !this.entrance);
    this.entrance = false;
    this.root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sel = ITEMS.indexOf(b.dataset.item as Item);
        this.activate(b.dataset.item as Item);
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) =>
      b.addEventListener('mouseenter', () => {
        const i = ITEMS.indexOf(b.dataset.item as Item);
        if (i !== this.sel) {
          this.sel = i;
          this.syncSel();
        }
      }),
    );
    this.bindDifficulty();
    this.root.querySelector('.plaque')?.addEventListener('click', () => {
      uiSound.press();
      this.panel = 'sound';
      this.renderPanel();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang as 'en' | 'ja')));
    this.renderPanel();
    this.updatePlaque();
  }

  private syncSel() {
    this.root.querySelectorAll('[data-item]').forEach((x, j) => x.classList.toggle('sel', j === this.sel));
  }

  private bindDifficulty() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
      b.addEventListener('click', () => {
        setDifficulty(b.dataset.diff as DifficultyId);
        this.renderDifficulty();
      }),
    );
  }

  /** Swap just the difficulty picker. */
  private renderDifficulty() {
    const el = this.root.querySelector('.difficulty');
    if (!el) return;
    el.outerHTML = this.difficultyHtml();
    this.bindDifficulty();
  }

  /** Open, swap or close the panel without touching the poster behind it. */
  private renderPanel() {
    const slot = this.root.querySelector('.panel-slot');
    if (!slot) return;
    const same = this.panel !== null && this.panel === this.shownPanel;
    const scroll = slot.querySelector('.body')?.scrollTop ?? 0;
    slot.innerHTML = this.panel ? `<div class="scrim${same ? ' settled' : ''}">${this.panelHtml(this.panel)}</div>` : '';
    this.shownPanel = this.panel;
    if (!this.panel) return;
    if (same) slot.querySelector('.body')?.scrollTo(0, scroll);
    const close = () => {
      this.panel = null;
      this.renderPanel();
    };
    slot.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => b.addEventListener('click', close));
    slot.querySelector('.scrim')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });
    slot.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        this.panel = b.dataset.open as Panel;
        this.renderPanel();
      }),
    );
    slot.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
      b.addEventListener('click', () => {
        unlock();
        if (!prefs.music) setMusicOn(true);
        void music.playTrack(b.dataset.play!).then(() => this.syncSoundNow());
      }),
    );
    slot.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((b) =>
      b.addEventListener('click', () => {
        const [id, v] = b.dataset.vote!.split(':') as [string, Vote];
        const votes = loadVotes();
        if (votes[id] === v) delete votes[id];
        else votes[id] = v;
        saveVotes(votes);
        const row = b.closest('.track');
        row?.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((x) => {
          const kind = x.dataset.vote!.split(':')[1];
          x.className = votes[id] === kind ? `on ${kind}` : '';
        });
      }),
    );
    slot.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', () => void this.copyPicks());
    slot.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) =>
      b.addEventListener('click', () => {
        const [what, val] = (b.dataset.set as string).split(':');
        if (what === 'music') {
          setMusicOn(val === 'on');
          if (val === 'on') music.resume();
        }
        if (what === 'sfx') setSfxOn(val === 'on');
        if (what === 'lang') return setLang(val as 'en' | 'ja'); // re-renders everything via onLang
        this.renderPanel();
      }),
    );
  }

  /** Move the Sound Test's "now playing" highlight without rebuilding the list. */
  private syncSoundNow() {
    if (!this.open || this.panel !== 'sound') return;
    const id = music.currentTrackId();
    this.root.querySelectorAll<HTMLElement>('.panel.sound .track').forEach((row) => {
      const now = row.dataset.track === id;
      row.classList.toggle('now', now);
      const b = row.querySelector('.play');
      if (b) b.textContent = now ? '♪' : '▶';
    });
  }

  /** The Sound Test votes as plain text on the clipboard, grouped by stage. */
  private async copyPicks() {
    const votes = loadVotes();
    const lines = ['Kaiju Rampage soundtrack picks'];
    for (const st of STAGES) {
      const list = tracks.all().filter((x) => x.contexts[0] === st);
      if (!list.length) continue;
      lines.push('', `${t(`st_${st}` as 'st_title')}:`);
      for (const x of list) lines.push(`  ${votes[x.id] === 'keep' ? '👍 keep' : votes[x.id] === 'cut' ? '👎 cut ' : '·  —   '}  ${x.title} (${x.artist})`);
    }
    const text = lines.join('\n');
    const note = this.root.querySelector('.sound-foot .copied');
    try {
      await navigator.clipboard.writeText(text);
      if (note) note.textContent = t('soundCopied');
    } catch {
      // No clipboard permission: show the text so it can be selected by hand.
      if (note) note.innerHTML = `<textarea readonly rows="8">${esc(text)}</textarea>`;
    }
  }

  private difficultyHtml() {
    const cur = difficultyId(), locked = difficultyLocked();
    const btns = DIFFICULTIES.map(
      (d) => `<button data-diff="${d}" class="${d === cur ? 'on' : ''} ${d}" ${locked && d !== cur ? 'disabled' : ''}>${esc(t(`diff_${d}` as 'diff_easy'))}</button>`,
    ).join('');
    return `<div class="difficulty">
      <div class="label">${esc(t('s_difficulty'))} <span class="arrows">◀ ▶</span></div>
      <div class="pill" role="group" aria-label="${esc(t('s_difficulty'))}">${btns}</div>
      <div class="desc">${esc(locked ? t('diffDaily') : t(`diffDesc_${cur}` as 'diffDesc_easy'))}</div>
    </div>`;
  }

  private panelHtml(p: Exclude<Panel, null>) {
    const head = (title: string) => `<header><h2>${esc(title)}</h2><button data-close>${esc(t('back'))}</button></header>`;
    if (p === 'how') {
      const rows: [string, string][] = [
        ['WASD / ↑↓←→', t('how_move')],
        ['AUTO', t('how_attack')],
        ['SPACE', t('how_stomp')],
        ['GROW', t('how_grow')],
        ['1 · 2 · 3', t('how_level')],
        ['CRATES', t('how_items')],
        ['SCORE', t('how_score')],
        ['LANDMARKS', t('how_landmarks')],
        ['WIN', t('how_win')],
        ['← →', t('how_diff')],
        ['P · M · L', t('how_keys')],
      ];
      return `<section class="panel">${head(t('m_how'))}<div class="body">
        <p class="lede"><b>${esc(t('whatIs'))}</b> ${esc(t('whatIsBody'))}</p>
        <ul>${rows.map(([k, v]) => `<li><span class="k">${esc(k)}</span><span>${esc(v)}</span></li>`).join('')}</ul>
      </div></section>`;
    }
    if (p === 'codex') {
      const cards = UPGRADES.map(
        (u) => `<div class="card" style="--c:${KIND_COLOR[u.kind]}">
          <div class="glyph" lang="ja">${upGlyph(u.id)}</div>
          <div class="name">${esc(upName(u.id))}<small>${esc(t(`kind_${u.kind}` as 'kind_weapon'))} · ${esc(t('maxLv', { n: u.max }))}</small></div>
          <div class="desc">${esc(upDesc(u.id, 1))}</div>
        </div>`,
      ).join('');
      const evos = EVOLUTIONS.map(
        (e) => `<div class="card" style="--c:#ffd24a">
          <div class="glyph" lang="ja">${evoGlyph(e.id)}</div>
          <div class="name">${esc(evoName(e.id))}<small>${esc(t('evoNeeds', { w: upName(e.weapon), p: upName(e.passive) }))}</small></div>
          <div class="desc">${esc(evoDesc(e.id))}</div>
        </div>`,
      ).join('');
      return `<section class="panel">${head(t('m_codex'))}<div class="body"><p>${esc(t('codexIntro'))}</p><div class="codex">${cards}</div>
        <p class="lede" style="margin-top:1.2em"><b>${esc(t('evolutions'))}</b> ${esc(t('evoHow'))}</p><div class="codex">${evos}</div></div></section>`;
    }
    if (p === 'sound') {
      const all = tracks.all();
      if (!all.length) return `<section class="panel">${head(t('m_sound'))}<div class="body"><p>${esc(t('soundNone'))}</p></div></section>`;
      const votes = loadVotes();
      const playing = music.currentTrackId();
      const groups = STAGES.map((st) => {
        const rows = all.filter((x) => x.contexts[0] === st).map((x) => {
          const v = votes[x.id];
          const tags = (x.tags ?? []).map((g) => `<span class="tag${/8-bit/i.test(g) ? ' bit' : ''}">${esc(g)}</span>`).join('');
          return `<div class="track${x.id === playing ? ' now' : ''}" data-track="${x.id}">
            <button class="play" data-play="${x.id}" aria-label="Play ${esc(x.title)}">${x.id === playing ? '♪' : '▶'}</button>
            <div class="info"><b>${esc(x.title)}</b><small>${esc(x.artist)}</small><div class="tags">${tags}</div></div>
            <div class="pill vote"><button data-vote="${x.id}:keep" class="${v === 'keep' ? 'on keep' : ''}">👍 ${esc(t('soundKeep'))}</button><button data-vote="${x.id}:cut" class="${v === 'cut' ? 'on cut' : ''}">👎 ${esc(t('soundCut'))}</button></div>
          </div>`;
        }).join('');
        return rows ? `<h3>${esc(t(`st_${st}` as 'st_title'))}</h3>${rows}` : '';
      }).join('');
      return `<section class="panel sound">${head(t('m_sound'))}<div class="body">
        <p class="lede">${esc(t('soundIntro'))}</p>${groups}
        <div class="sound-foot"><button class="copy" data-copy>${esc(t('soundCopy'))}</button><span class="copied"></span></div>
      </div></section>`;
    }
    if (p === 'scores') {
      const table = (list: ScoreEntry[]) =>
        list.length
          ? `<table><tr><th>${esc(t('h_rank'))}</th><th>${esc(t('h_name'))}</th><th>${esc(t('h_score'))}</th><th>${esc(t('h_diff'))}</th><th>${esc(t('grade'))}</th><th>${esc(t('h_result'))}</th><th>${esc(t('h_date'))}</th></tr>${list
              .map(
                (e, i) =>
                  `<tr><td>${i + 1}</td><td><b>${esc(e.name)}</b></td><td>${e.score.toLocaleString()}</td><td>${esc(t(`diff_${e.difficulty ?? 'easy'}` as 'diff_easy'))}</td><td>${esc(e.grade)}</td><td>${esc(this.resultShort(e))}</td><td>${esc(e.date.slice(0, 10))}</td></tr>`,
              )
              .join('')}</table>`
          : `<p>${esc(t('noRuns'))}</p>`;
      const day = DAILY ?? todayKey();
      return `<section class="panel scores">${head(t('m_scores'))}<div class="body">
        <p class="lede"><b>${esc(t('allTime'))}</b></p>${table(loadBoard())}
        <p class="lede" style="margin-top:1em"><b>${esc(t('today'))}</b> · ${esc(day)} · ${esc(t('dailyDesc'))}</p>${table(loadDaily(day))}
      </div></section>`;
    }
    const toggle = (what: string, on: boolean) =>
      `<div class="pill"><button data-set="${what}:on" class="${on ? 'on' : ''}">${esc(t('on'))}</button><button data-set="${what}:off" class="${on ? '' : 'on'}">${esc(t('off'))}</button></div>`;
    return `<section class="panel narrow">${head(t('m_settings'))}<div class="body"><div class="settings">
      <span>${esc(t('s_language'))}</span>
      <div class="pill"><button data-set="lang:en" class="${getLang() === 'en' ? 'on' : ''}">English</button><button data-set="lang:ja" class="jp ${getLang() === 'ja' ? 'on' : ''}">日本語</button></div>
      <span>${esc(t('s_music'))}</span>${toggle('music', prefs.music)}
      <span>${esc(t('s_sfx'))}</span>${toggle('sfx', prefs.sfx)}
      <span>${esc(t('m_sound'))}</span><button class="sound-open" data-open="sound">♪ ${esc(t('soundOpen'))} →</button>
      <p class="note">${esc(t('jpNote'))}</p>
    </div></div></section>`;
  }

  private resultShort(e: ScoreEntry) {
    return e.endless ? t('resEndlessShort', { n: e.wave }) : e.victory ? t('resVictoryShort') : t('resWaveShort', { n: e.wave });
  }

  private updatePlaque() {
    const pl = this.root?.querySelector('.plaque');
    if (!pl) return;
    const np = music.nowPlaying();
    const title = pl.querySelector('.title')!;
    const meta = pl.querySelector('.meta')!;
    const bar = pl.querySelector('.bar i') as HTMLElement;
    if (!np || prefs.muted || !prefs.music) {
      pl.classList.add('silent');
      title.textContent = !isRunning() ? t('soundHint') : t('musicOff');
      meta.textContent = '';
      bar.style.width = '0';
      return;
    }
    pl.classList.remove('silent');
    const ja = getLang() === 'ja';
    if (np.kind === 'track') title.textContent = np.en;
    else title.innerHTML = ja ? `<span class="jp" style="margin:0">${esc(np.ja)}</span><span class="alt">${esc(np.en)}</span>` : `${esc(np.en)}<span class="jp">${esc(np.ja)}</span>`;
    meta.textContent = ja ? np.metaJa : np.meta;
    bar.style.width = `${Math.round(np.progress * 100)}%`;
  }
}

export const overlay = new Overlay();
