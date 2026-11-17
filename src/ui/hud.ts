// Everything drawn over the 3D view: vitals, the sentence being spoken, the four bound keys,
// prompts, journal pages and the menus.
import * as THREE from 'three';
import './hud.css';
import { SIGILS, glyphSvg, hexColor, type SigilId } from '../magic/sigils';
import { sentencesFor, type SpellDef } from '../magic/grammar';
import type { JournalDef } from '../world/level';
import type { Knowledge } from '../game/save';
import { PLAYER } from '../player/player';

const ARROWS = ['↑', '←', '→', '↓'];
const KEY_CLASS = ['up', 'left', 'right', 'down'];
const KEY_NAME = ['Up', 'Left', 'Right', 'Down'];

const el = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const rune = (id: SigilId, width = 4) => `<span style="--c:${hexColor(SIGILS[id].color)}">${glyphSvg(id, width)}</span>`;

export type OverlayKind = 'title' | 'paused' | 'dead' | 'journal' | 'book' | null;

export class Hud {
  readonly root: HTMLElement;
  overlay: OverlayKind = null;

  private healthFill: HTMLElement;
  private healthNum: HTMLElement;
  private focusFill: HTMLElement;
  private focusNum: HTMLElement;
  private focusBar: HTMLElement;
  private hurtEl: HTMLElement;
  private reticle: HTMLElement;
  private promptEl: HTMLElement;
  private whisperEl: HTMLElement;
  private sentenceEl: HTMLElement;
  private spellEl: HTMLElement;
  private keysEl: HTMLElement;
  private placeEl: HTMLElement;
  private bannerEl: HTMLElement;
  private toastsEl: HTMLElement;
  private numbersEl: HTMLElement;
  private overlayEl: HTMLElement;
  private whisperT = 0;
  private bannerT = 0;
  private promptText = '';
  private maxWords = 2;

  constructor(parent: HTMLElement, private camera: THREE.Camera) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="vignette"></div>
      <div class="hurt"></div>
      <div class="numbers"></div>
      <div class="place"></div>
      <div class="banner"><div class="big"></div><div class="small"></div></div>
      <div class="reticle"><svg viewBox="0 0 100 100">
        <path class="hit" d="M24 24 L38 38 M76 24 L62 38 M24 76 L38 62 M76 76 L62 62"/>
        <path d="M50 34 L66 50 L50 66 L34 50 Z"/><circle cx="50" cy="50" r="3.4"/></svg></div>
      <div class="prompt"></div>
      <div class="whisper"></div>
      <div class="vitals">
        <div class="label">Health</div>
        <div class="bar health"><div class="track"><div class="fill"></div></div><div class="num"></div></div>
        <div class="label">Focus</div>
        <div class="bar focus"><div class="track"><div class="fill"></div></div><div class="num"></div></div>
      </div>
      <div class="speech">
        <div class="spell"></div>
        <div class="sentence"></div>
        <div class="keys"></div>
      </div>
      <div class="toasts"></div>
      <div class="overlay"></div>`;
    parent.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.healthFill = q('.health .fill');
    this.healthNum = q('.health .num');
    this.focusFill = q('.focus .fill');
    this.focusNum = q('.focus .num');
    this.focusBar = q('.bar.focus');
    this.hurtEl = q('.hurt');
    this.reticle = q('.reticle');
    this.promptEl = q('.prompt');
    this.whisperEl = q('.whisper');
    this.sentenceEl = q('.sentence');
    this.spellEl = q('.spell');
    this.keysEl = q('.keys');
    this.placeEl = q('.place');
    this.bannerEl = q('.banner');
    this.toastsEl = q('.toasts');
    this.numbersEl = q('.numbers');
    this.overlayEl = q('.overlay');
    this.setSentence([], null, false);
  }

  // ---- per-frame ---------------------------------------------------------------------------

  update(dt: number, health: number, focus: number) {
    this.healthFill.style.transform = `scaleX(${Math.max(0, health / PLAYER.maxHealth)})`;
    this.healthNum.innerHTML = `${Math.ceil(health)}<small>/${PLAYER.maxHealth}</small>`;
    this.focusFill.style.transform = `scaleX(${Math.max(0, focus / PLAYER.maxFocus)})`;
    this.focusNum.innerHTML = `${Math.floor(focus)}<small>/${PLAYER.maxFocus}</small>`;
    if (this.whisperT > 0) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) this.whisperEl.classList.remove('on');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('on');
    }
  }

  setKeys(k: Knowledge) {
    this.keysEl.innerHTML = k.bound.map((id, slot) => {
      const s = id ? SIGILS[id] : null;
      return `<div class="key ${KEY_CLASS[slot]}${s ? ' bound' : ''}" data-slot="${slot}" style="--c:${s ? hexColor(s.color) : '#888'}">
        ${s ? `<div class="glyph">${glyphSvg(s.id)}</div><div>${s.name}</div>` : `<div class="arrow">${ARROWS[slot]}</div><div></div>`}</div>`;
    }).join('');
  }

  pressKey(slot: number) {
    const key = this.keysEl.querySelector(`[data-slot="${slot}"]`);
    if (!key) return;
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 140);
  }

  setMaxWords(n: number) {
    this.maxWords = n;
  }

  setSentence(words: SigilId[], spell: SpellDef | null, known: boolean) {
    let html = '';
    for (let i = 0; i < 3; i++) {
      const id = words[i];
      if (id) html += `<div class="word said" style="--c:${hexColor(SIGILS[id].color)}">${glyphSvg(id)}</div>`;
      else html += `<div class="word${i >= this.maxWords ? ' locked' : ''}"></div>`;
    }
    this.sentenceEl.innerHTML = html;
    this.spellEl.classList.remove('cast');
    if (!words.length) {
      this.spellEl.innerHTML = '';
    } else if (spell) {
      this.spellEl.className = `spell${known ? '' : ' unknown'}`;
      this.spellEl.innerHTML = `<span class="name">${known ? spell.name : 'An unspoken sentence'}</span><span class="cost">${spell.cost} focus</span>`;
    } else {
      this.spellEl.className = 'spell unknown';
      this.spellEl.innerHTML = '<span class="name">…</span>';
    }
  }

  /** Flash the name of what was just cast. */
  named(spell: SpellDef) {
    this.spellEl.className = 'spell';
    this.spellEl.innerHTML = `<span class="name">${spell.name}</span>`;
    void this.spellEl.offsetWidth;
    this.spellEl.classList.add('cast');
  }

  discovery(spell: SpellDef) {
    this.named(spell);
    this.toast(spell.authored ? 'A sentence from the journal' : 'A sentence of your own', spell.name, spell.text, spell.words);
  }

  toast(kicker: string, title: string, text: string, words: SigilId[] = []) {
    const t = el('div', 'toast', `
      <div class="kicker">${kicker}</div><div class="title">${title}</div><div class="text">${text}</div>
      ${words.length ? `<div class="runes">${words.map((w) => rune(w)).join('')}</div>` : ''}`);
    this.toastsEl.appendChild(t);
    setTimeout(() => t.remove(), 6600);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstElementChild!.remove();
  }

  shakeSentence() {
    this.sentenceEl.classList.remove('shake');
    void this.sentenceEl.offsetWidth;
    this.sentenceEl.classList.add('shake');
  }

  shakeFocus() {
    this.focusBar.classList.remove('short');
    void this.focusBar.offsetWidth;
    this.focusBar.classList.add('short');
  }

  whisper(text: string) {
    this.whisperEl.textContent = text;
    this.whisperEl.classList.add('on');
    this.whisperT = 2.2;
  }

  setPrompt(text: string) {
    if (text === this.promptText) return;
    this.promptText = text;
    this.promptEl.innerHTML = text;
  }

  setPlace(kicker: string, title: string, sub = '', pips: boolean[] = []) {
    this.placeEl.innerHTML = `
      ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
      ${title ? `<div class="title">${title}</div>` : ''}
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      ${pips.length ? `<div class="pips">${pips.map((d) => `<i class="${d ? 'done' : ''}"></i>`).join('')}</div>` : ''}`;
  }

  banner(big: string, small = '', seconds = 3.2) {
    (this.bannerEl.querySelector('.big') as HTMLElement).textContent = big;
    (this.bannerEl.querySelector('.small') as HTMLElement).textContent = small;
    this.bannerEl.classList.add('on');
    this.bannerT = seconds;
  }

  hurt() {
    this.hurtEl.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.hurtEl.classList.remove('on')));
  }

  hitMarker() {
    this.reticle.classList.remove('struck');
    void this.reticle.offsetWidth;
    this.reticle.classList.add('struck');
  }

  /** A damage number rising from a point in the world. */
  number(at: THREE.Vector3, value: number, kind: 'hit' | 'burn' | 'fall') {
    const p = at.clone().project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
    const n = el('div', `number ${kind}${kind === 'hit' && value >= 45 ? ' big' : ''}`);
    n.textContent = String(value);
    n.style.left = `${(p.x * 0.5 + 0.5) * 100 + (Math.random() - 0.5) * 3}%`;
    n.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    this.numbersEl.appendChild(n);
    setTimeout(() => n.remove(), 900);
    if (this.numbersEl.children.length > 40) this.numbersEl.firstElementChild!.remove();
  }

  // ---- overlays ----------------------------------------------------------------------------

  private show(kind: OverlayKind, html: string, clear = false) {
    this.overlay = kind;
    this.overlayEl.innerHTML = html;
    this.overlayEl.className = `overlay${kind ? ' on' : ''}${clear ? ' clear' : ''}`;
  }

  hideOverlay() {
    this.show(null, '');
  }

  private controls() {
    return `<div class="keys-help">
      <span><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span><span>Move</span>
      <span>Trackpad</span><span>Look and aim</span>
      <span><kbd>Space</kbd></span><span>Jump</span>
      <span><kbd>Shift</kbd></span><span>Dodge</span>
      <span><kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd></span><span>Speak a sigil. Two in a row make a sentence.</span>
      <span>Click or <kbd>Enter</kbd></span><span>Cast the sentence where you look</span>
      <span><kbd>Backspace</kbd></span><span>Let the sentence go</span>
      <span><kbd>E</kbd></span><span>Read a journal page</span>
      <span><kbd>Tab</kbd></span><span>Your own journal</span>
      <span><kbd>Esc</kbd></span><span>Pause</span>
      <span><kbd>O</kbd></span><span>Effects full or light (use light if it runs slowly)</span>
    </div>`;
  }

  showTitle(k: Knowledge, onStart: () => void) {
    const returning = k.sigils.length > 0;
    const touch = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
    this.show('title', `<div class="menu">
      <div class="logo">Gloamtide</div>
      <div class="tag">First playable · The Wreck Shore</div>
      <button class="start" id="start">${returning ? 'Wake on the shore again' : 'Wake on the shore'}</button>
      ${this.controls()}
      <div class="note">${returning
        ? `You remember <b>${k.sigils.length}</b> ${k.sigils.length === 1 ? 'word' : 'words'} and <b>${k.sentences.length}</b> ${k.sentences.length === 1 ? 'sentence' : 'sentences'}.`
        : 'You know no magic yet. There is a body on the sand beside you, and something in its hand.'}</div>
      ${touch ? '<div class="note"><b>Gloamtide needs a keyboard and a trackpad or mouse.</b> Open it on a laptop or desktop to play.</div>' : ''}
    </div>`);
    (this.overlayEl.querySelector('#start') as HTMLElement).onclick = onStart;
  }

  showPaused(k: Knowledge, actions: { resume: () => void; learnAll: () => void; forget: () => void; effects: 'full' | 'light'; toggleEffects: () => void }) {
    this.show('paused', `<div class="menu">
      <h2>Paused</h2>
      <button class="start" id="resume">Return</button>
      ${this.controls()}
      <div class="links">
        <button id="effects">Effects: ${actions.effects === 'full' ? 'full (switch to light if it runs slowly)' : 'light (switch to full)'}</button>
        ${k.sigils.length < 4 ? '<button id="learn">Know all four words now (for testing)</button>' : ''}
        <button id="forget">Forget everything and start over</button>
      </div>
    </div>`);
    (this.overlayEl.querySelector('#resume') as HTMLElement).onclick = actions.resume;
    const learn = this.overlayEl.querySelector('#learn') as HTMLElement | null;
    if (learn) learn.onclick = actions.learnAll;
    (this.overlayEl.querySelector('#forget') as HTMLElement).onclick = actions.forget;
    (this.overlayEl.querySelector('#effects') as HTMLElement).onclick = actions.toggleEffects;
  }

  showDeath(k: Knowledge, cause: string) {
    this.show('dead', `<div class="menu">
      <h2>The tide takes you back</h2>
      <div class="tag">${cause}</div>
      <div class="kept">You keep what you know: <b>${k.sigils.length}</b> ${k.sigils.length === 1 ? 'word' : 'words'},
        <b>${k.sentences.length}</b> ${k.sentences.length === 1 ? 'sentence' : 'sentences'}.</div>
    </div>`, true);
  }

  showJournal(j: JournalDef, learned: { id: SigilId; slot: number } | null) {
    const s = learned ? SIGILS[learned.id] : null;
    this.show('journal', `<div class="page">
      <div class="kicker">The mage's journal</div>
      <h2>${j.title}</h2>
      ${j.text.map((p) => `<p>${p}</p>`).join('')}
      ${s && learned ? `<div class="learned" style="--c:${hexColor(s.color)}">
          <div class="rune">${glyphSvg(s.id, 3)}</div>
          <div><div class="kicker">You have learned a word</div><div class="name">${s.name}</div>
          <div class="meaning">${s.meaning}<br><b>It sits on your ${KEY_NAME[learned.slot]} arrow key.</b></div></div>
        </div>` : ''}
      <div class="close"><kbd>E</kbd> Close</div>
    </div>`, true);
  }

  showBook(k: Knowledge) {
    const all = sentencesFor(k.sigils);
    const found = all.filter((s) => k.sentences.includes(s.key));
    const entries = all.map((s) => {
      const has = k.sentences.includes(s.key);
      return `<div class="entry${has ? '' : ' unfound'}">
        <div class="runes">${s.words.map((w) => rune(w)).join('')}</div>
        <div><div class="name">${has ? s.name : 'Not yet spoken'}${has && !s.authored ? '<small>Your own</small>' : ''}</div>
        ${has ? `<div class="text">${s.text}</div>` : ''}</div></div>`;
    }).join('');
    this.show('book', `<div class="book">
      <h2>Your journal</h2>
      <div class="count">${k.sigils.length} of 8 words · ${found.length} of ${all.length} sentences you can form</div>
      <div class="entries">${entries || '<div class="entry unfound"><div></div><div class="name">You know no words yet.</div></div>'}</div>
    </div>`, true);
  }
}
