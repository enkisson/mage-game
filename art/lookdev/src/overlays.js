// HTML overlays drawn over the 3D render: in-run HUD, boon draft, title screen, labels.
// Everything is laid out on a 1920-wide grid and scaled with --u so any render size works.

const iconCache = new Map();
async function icon(name) {
  if (!iconCache.has(name)) {
    const res = await fetch(`../ui/icons/${name}.svg`);
    if (!res.ok) throw new Error(`missing icon ${name}`);
    iconCache.set(name, await res.text());
  }
  return `<span class="ico">${iconCache.get(name)}</span>`;
}

/** A 1920-wide layer scaled to the frame, so overlay CSS is written in plain 1080p pixels. */
function layer(frame, width, cls) {
  const u = width / 1920;
  const el = document.createElement('div');
  el.className = `overlay ${cls}`;
  el.style.width = '1920px';
  el.style.height = `${frame.clientHeight / u}px`;
  el.style.transform = `scale(${u})`;
  frame.appendChild(el);
  return el;
}

const pct = (v, max) => `${Math.round((v / max) * 100)}%`;

/** In-run HUD. `numbers` are floating combat numbers already projected to screen px. */
export async function hud(frame, { width, numbers = [] }) {
  const el = layer(frame, width, 'hud');
  const u = width / 1920;
  const spells = [
    { key: 'LMB', name: 'Ember Bolt', icon: 'ember-bolt', school: 'fire', cost: 8 },
    { key: 'RMB', name: 'Frost Lance', icon: 'frost-lance', school: 'frost', cost: 20, cd: 0.42, cdText: '2.1' },
    { key: 'SHIFT', name: 'Blink', icon: 'blink', school: 'ward', charges: [1, 0] },
    { key: 'Q', name: 'Starfall', icon: 'starfall', school: 'storm', charge: 0.78, ult: true },
  ];
  const boons = [
    { icon: 'ember-echo', school: 'fire', name: 'Ember Echo', stack: 2 },
    { icon: 'kindled-soul', school: 'fire', name: 'Kindled Soul' },
    { icon: 'glacial-heart', school: 'frost', name: 'Glacial Heart' },
    { icon: 'static-tithe', school: 'storm', name: 'Static Tithe', stack: 3 },
  ];

  const spellHtml = await Promise.all(spells.map(async (s) => `
    <div class="slot ${s.school}${s.ult ? ' ult' : ''}${s.cd ? ' cooling' : ''}">
      <div class="slot-face">
        ${await icon(s.icon)}
        ${s.cd ? `<div class="cd" style="height:${s.cd * 100}%"></div><div class="cd-num">${s.cdText}</div>` : ''}
        ${s.ult ? `<svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="${s.charge * 100} 100"/></svg>` : ''}
      </div>
      <div class="key">${s.key}</div>
      <div class="slot-meta">${s.cost ? `<span class="cost">${s.cost}</span>` : ''}${s.charges ? `<span class="pips">${s.charges.map((c) => `<i class="${c ? 'on' : ''}"></i>`).join('')}</span>` : ''}${s.ult ? `<span class="cost">${Math.round(s.charge * 100)}%</span>` : ''}</div>
    </div>`));

  const boonHtml = await Promise.all(boons.map(async (b) => `
    <div class="boon ${b.school}">${await icon(b.icon)}${b.stack ? `<b>${b.stack}</b>` : ''}</div>`));

  el.innerHTML = `
    <div class="vignette"></div>
    <div class="hurt"></div>

    <div class="run">
      <div class="run-row"><span class="lbl">Night</span><span class="val">II</span></div>
      <div class="run-row"><span class="lbl">Time</span><span class="val">11:42</span></div>
      <div class="run-row"><span class="lbl">Banished</span><span class="val">186</span></div>
    </div>

    <div class="wave">
      <div class="wave-top"><span>Night II</span><i></i><span>Rift surge in 0:14</span></div>
      <div class="wave-title">Wave <em>7</em></div>
      <div class="tide">
        <div class="tide-bar"><div class="tide-fill" style="width:58%"></div>${Array.from({ length: 9 }, () => '<i></i>').join('')}</div>
        <div class="tide-text">${await icon('skull-mask')}<b>23</b> Gloam remain</div>
      </div>
    </div>

    <div class="threat"><span>Brute</span><svg viewBox="0 0 40 60"><path d="M30 6 L8 30 L30 54"/><path d="M38 14 L22 30 L38 46"/></svg></div>

    <div class="vitals">
      <div class="essence">${await icon('essence')}<b>340</b><span>essence</span></div>
      <div class="bar ward"><div class="bar-ico">${await icon('ward')}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(38, 60)}"></div><div class="bar-ghost" style="width:${pct(46, 60)}"></div></div><div class="bar-num">38<small>/60</small></div></div>
      <div class="bar health"><div class="bar-ico">${await icon('vitality')}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(96, 120)}"></div></div><div class="bar-num">96<small>/120</small></div></div>
    </div>

    <div class="spells">
      <div class="slots">${spellHtml.join('')}</div>
      <div class="mana"><span class="lbl">Mana</span><div class="mana-track"><div class="mana-fill" style="width:62%"></div>${Array.from({ length: 9 }, () => '<i></i>').join('')}</div><span class="val">62<small>/100</small></span></div>
    </div>

    <div class="staff">
      <div class="staff-name">Cinderbrand</div>
      <div class="staff-sub">Ember staff · Tier II</div>
    </div>

    <div class="boons">${boonHtml.join('')}</div>

    <div class="reticle">
      <svg viewBox="0 0 100 100">
        <path class="hit" d="M30 30 L40 40 M70 30 L60 40 M30 70 L40 60 M70 70 L60 60"/>
        <path d="M50 38 L62 50 L50 62 L38 50 Z"/>
        <circle cx="50" cy="50" r="2.4"/>
      </svg>
    </div>

    ${numbers.map((n) => `<div class="num ${n.kind}" style="left:${n.at[0] / u}px;top:${n.at[1] / u}px">${n.text}</div>`).join('')}
  `;
}

/** Between waves: pick one of three boons at the Wellspring. */
export async function draftScreen(frame, { width }) {
  const el = layer(frame, width, 'draft');
  const cards = [
    { school: 'fire', schoolName: 'Ember', rarity: 'Rare', name: 'Ember Echo', icon: 'ember-echo', level: 'II → III',
      text: 'Ember Bolts <b>split into 3</b> on impact. Each shard deals <b>40%</b> damage.', tags: ['Projectile', 'On hit'], synergy: 'Kindled Soul' },
    { school: 'frost', schoolName: 'Rime', rarity: 'Common', name: 'Glacial Heart', icon: 'glacial-heart', level: 'New',
      text: '<b>+20 max Ward.</b> Ward recovers <b>30% faster</b> while a Chilled enemy is within 8 m.', tags: ['Defence', 'Chill'] },
    { school: 'storm', schoolName: 'Tempest', rarity: 'Epic', name: 'Static Tithe', icon: 'static-tithe', level: 'III → IV',
      text: 'Chain Lightning jumps <b>+2 times</b>. Every Gloam it banishes drops <b>2 essence</b>.', tags: ['Chain', 'Economy'], synergy: 'Overcharge' },
  ];
  const cardHtml = await Promise.all(cards.map(async (c, i) => `
    <div class="card ${c.school}${i === 2 ? ' focus' : ''}">
      <div class="card-head"><span class="school">${c.schoolName}</span><span class="rarity ${c.rarity.toLowerCase()}">${c.rarity}</span></div>
      <div class="card-art">${await icon(c.icon)}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-level">${c.level}</div>
      <p class="card-text">${c.text}</p>
      <div class="card-tags">${c.tags.map((t) => `<span>${t}</span>`).join('')}</div>
      ${c.synergy ? `<div class="card-syn">Pairs with <b>${c.synergy}</b></div>` : '<div class="card-syn empty"></div>'}
    </div>`));
  el.innerHTML = `
    <div class="draft-shade"></div>
    <div class="draft-top">
      <div class="draft-kicker">Wave 7 held · 0 damage taken bonus +25</div>
      <div class="draft-title">The Wellspring offers</div>
      <div class="draft-sub">Choose one boon. The tide returns when you step off the seal.</div>
    </div>
    <div class="cards">${cardHtml.join('')}</div>
    <div class="draft-foot">
      <div class="btn">${await icon('essence')}Reroll <b>25</b></div>
      <div class="btn">Skip <b>+40</b> ${await icon('essence')}</div>
      <div class="draft-wallet">${await icon('essence')}<b>340</b> essence</div>
    </div>
  `;
}

export async function titleScreen(frame, { width }) {
  const el = layer(frame, width, 'title');
  el.innerHTML = `
    <div class="title-shade"></div>
    <div class="logo">
      <div class="logo-word">Gloamtide</div>
      <div class="logo-rule"><i></i>${await icon('rift')}<i></i></div>
      <div class="logo-tag">Hold the sanctum. Outlast the tide.</div>
    </div>
    <nav class="menu">
      <div class="item active">Begin a Run</div>
      <div class="item">The Codex</div>
      <div class="item">Sanctum</div>
      <div class="item">Settings</div>
      <div class="item dim">Quit</div>
    </nav>
    <div class="title-foot"><span>Concept mock-up</span><span>v0.0 look-dev</span></div>
  `;
}

/** Name plates under models, e.g. the bestiary lineup. items: { at:[x,y], title, sub, stat } */
export function labels(frame, { width, items, cls = '' }) {
  const el = layer(frame, width, `labels ${cls}`);
  const u = width / 1920;
  el.innerHTML = items.map((it) => `
    <div class="plate ${it.kind || ''}" style="left:${it.at[0] / u}px;top:${it.at[1] / u}px">
      ${it.title ? `<div class="plate-title">${it.title}</div>` : ''}
      ${it.sub ? `<div class="plate-sub">${it.sub}</div>` : ''}
      ${it.stat ? `<div class="plate-stat">${it.stat}</div>` : ''}
    </div>`).join('');
  return el;
}

export function heading(frame, { width, title, sub }) {
  const el = layer(frame, width, 'sheet-head');
  el.innerHTML = `<div class="sheet-title">${title}</div>${sub ? `<div class="sheet-sub">${sub}</div>` : ''}`;
}
