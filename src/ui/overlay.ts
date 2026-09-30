// The front page and its menus, as HTML over the canvas (pattern borrowed from the tavern project).
// The layer is sized to the canvas's letterboxed rectangle so the poster lines up at any window size.
import { getLang, onLang, setLang, t, upDesc, upGlyph, upName } from '../i18n';
import { UPGRADES, type UpgradeDef } from '../upgrades';
import { loadBest } from '../scores';
import { music } from '../audio/music';
import { isRunning, prefs, setMusicOn, setSfxOn, unlock } from '../audio/core';

type Panel = null | 'how' | 'codex' | 'scores' | 'settings';
type Item = 'start' | 'how' | 'codex' | 'scores' | 'settings';
const ITEMS: Item[] = ['start', 'how', 'codex', 'scores', 'settings'];
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
    this.root.hidden = false;
    this.place();
    this.render();
    if (isRunning()) music.play('title');
    if (this.plaqueTimer === null) this.plaqueTimer = window.setInterval(() => this.updatePlaque(), 200);
  }

  hide() {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    if (this.plaqueTimer !== null) clearInterval(this.plaqueTimer);
    this.plaqueTimer = null;
  }

  private place() {
    const canvas = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!canvas || !this.root) return;
    const r = canvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.root.style.setProperty('--u', `${r.width / 80}px`);
  }

  private start() {
    if (performance.now() - this.openedAt < 250) return;
    unlock();
    this.hide();
    this.onStart();
  }

  private activate(item: Item) {
    if (item === 'start') return this.start();
    this.panel = item;
    this.render();
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
        this.panel = null;
        this.render();
      }
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      handled();
      this.sel = (this.sel + 1) % ITEMS.length;
      this.render();
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      handled();
      this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
      this.render();
    } else if (code === 'Enter' || code === 'Space') {
      handled();
      this.activate(ITEMS[this.sel]);
    }
  }

  /** Gamepad / external input from the game (UIScene forwards pad presses). */
  press(code: 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Escape') {
    this.onKey(new KeyboardEvent('keydown', { code }));
  }

  private render() {
    if (!this.root) return;
    const best = loadBest();
    const bestLine = best
      ? `${esc(t('bestRun'))}: ${esc(best.victory ? t('runMech') : t('runWave', { n: best.wave }))} · ${esc(t('runBuildings', { n: best.buildings }))}`
      : '';
    const labels: Record<Item, string> = { start: t('m_start'), how: t('m_how'), codex: t('m_codex'), scores: t('m_scores'), settings: t('m_settings') };
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
        <div class="kicker">${getLang() === 'ja' ? 'KBN-7 報道部 提供' : 'KBN-7 NIGHT DESK PRESENTS'}</div>
        <h1 class="logo" aria-label="Kaiju Rampage"><span>KAIJU</span><span>RAMPAGE</span></h1>
        <div class="seal" aria-hidden="true"><b>怪</b></div>
        <div class="jp-title" lang="ja">怪獣大暴れ</div>
        <div class="tagline">${esc(t('tagline'))}</div>
        <div class="pitch">${esc(t('pitch'))}</div>
        <div class="teaser">${esc(t('kaijuTeaser'))}</div>
        <nav class="menu">${menu}</nav>
        <div class="best">${bestLine}</div>
        <div class="controls">
          <div class="pill" role="group" aria-label="${esc(t('s_language'))}">
            <button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button>
            <button data-lang="ja" class="jp ${getLang() === 'ja' ? 'on' : ''}">日本語</button>
          </div>
        </div>
        <div class="plaque silent">
          <div class="label"><span class="eq"><b></b><b></b><b></b></span>${esc(t('nowPlaying'))}</div>
          <div class="title"></div>
          <div class="meta"></div>
          <div class="bar"><i></i></div>
        </div>
        <div class="keyhint">${esc(t('keyHint'))}</div>
        <div class="credits">${esc(t('credits'))}</div>
      </div>
      ${this.panel ? `<div class="scrim">${this.panelHtml(this.panel)}</div>` : ''}`;
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
          this.root.querySelectorAll('[data-item]').forEach((x, j) => x.classList.toggle('sel', j === i));
        }
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang as 'en' | 'ja')));
    this.root.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) =>
      b.addEventListener('click', () => {
        this.panel = null;
        this.render();
      }),
    );
    this.root.querySelector('.scrim')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.panel = null;
        this.render();
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) =>
      b.addEventListener('click', () => {
        const [what, val] = (b.dataset.set as string).split(':');
        if (what === 'music') {
          setMusicOn(val === 'on');
          if (val === 'on') music.resume();
        }
        if (what === 'sfx') setSfxOn(val === 'on');
        if (what === 'lang') setLang(val as 'en' | 'ja');
        this.render();
      }),
    );
    this.updatePlaque();
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
        ['WIN', t('how_win')],
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
      return `<section class="panel">${head(t('m_codex'))}<div class="body"><p>${esc(t('codexIntro'))}</p><div class="codex">${cards}</div></div></section>`;
    }
    if (p === 'scores') {
      const best = loadBest();
      const body = best
        ? `<div class="big">${esc(best.victory ? t('runMech') : t('runWave', { n: best.wave }))}</div><p>${esc(t('runBuildings', { n: best.buildings }))}</p>`
        : `<p>${esc(t('noRuns'))}</p>`;
      return `<section class="panel scores">${head(t('m_scores'))}<div class="body"><p class="lede">${esc(t('bestRun'))}</p>${body}</div></section>`;
    }
    const toggle = (what: string, on: boolean) =>
      `<div class="pill"><button data-set="${what}:on" class="${on ? 'on' : ''}">${esc(t('on'))}</button><button data-set="${what}:off" class="${on ? '' : 'on'}">${esc(t('off'))}</button></div>`;
    return `<section class="panel">${head(t('m_settings'))}<div class="body"><div class="settings">
      <span>${esc(t('s_language'))}</span>
      <div class="pill"><button data-set="lang:en" class="${getLang() === 'en' ? 'on' : ''}">English</button><button data-set="lang:ja" class="jp ${getLang() === 'ja' ? 'on' : ''}">日本語</button></div>
      <span>${esc(t('s_music'))}</span>${toggle('music', prefs.music)}
      <span>${esc(t('s_sfx'))}</span>${toggle('sfx', prefs.sfx)}
      <p class="note">${esc(t('jpNote'))}</p>
    </div></div></section>`;
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
    title.innerHTML = ja ? `<span class="jp" style="margin:0">${esc(np.ja)}</span><span class="alt">${esc(np.en)}</span>` : `${esc(np.en)}<span class="jp">${esc(np.ja)}</span>`;
    meta.textContent = `${np.key} ${ja ? np.scaleJa : np.scale} · ${np.bpm} bpm`;
    bar.style.width = `${Math.round(np.progress * 100)}%`;
  }
}

export const overlay = new Overlay();
