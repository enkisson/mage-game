// Plays the built game without drawing it, and checks that the rules hold.
// Usage: npm run build && node tools/playtest.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };

// Each check runs in the page with `g` = the game, and returns [passed, detail].
const CHECKS = {
  'reading the first page teaches Fire, and the word can be cast': `
    g.debug.start();
    const before = g.knowledge.sigils.length;
    const book = g.level.landmarks.book;
    g.debug.teleport(book.x + 1.4, book.z + 1.1); g.debug.advance(0.2);
    g.input.inject('key', 'KeyE'); g.debug.advance(0.1);
    const reading = g.mode;
    g.input.inject('key', 'KeyE'); g.debug.advance(0.1);
    g.input.inject('key', 'ArrowUp'); g.debug.advance(0.3);
    g.input.inject('click'); g.debug.advance(0.3);
    return [before === 0 && reading === 'reading' && g.knowledge.sigils.join() === 'fire' && g.knowledge.bound[0] === 'fire'
      && g.knowledge.sentences.join() === 'fire' && g.player.focus < 100, JSON.stringify({ reading, k: g.knowledge, focus: Math.round(g.player.focus) })];`,

  'you can walk from where you wake to the page on the foremast, and it teaches Push': `
    g.debug.start(); g.debug.advance(2);
    const page = g.level.journals.find((j) => j.id === 'shore-2').position;
    let t = 0;
    while (t < 20 && Math.hypot(g.player.position.x - page.x, g.player.position.z - page.z) > 1.6) {
      g.debug.lookAt(page.x, g.player.position.y + 1.6, page.z);
      g.input.hold('KeyW', true); g.debug.advance(0.1); t += 0.1;
    }
    g.input.hold('KeyW', false); g.debug.advance(0.3);
    const near = g.player.position.distanceTo(page) < 2.7;
    g.input.inject('key', 'KeyE'); g.debug.advance(0.1);
    return [near && g.mode === 'reading' && g.knowledge.sigils.includes('push'),
      JSON.stringify({ near, seconds: +t.toFixed(1), mode: g.mode, at: g.player.position.toArray().map((n) => +n.toFixed(1)), page: page.toArray().map((n) => +n.toFixed(1)) })];`,

  'a third word is refused, and Backspace lets a sentence go': `
    g.debug.start(); g.debug.learnAll();
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp']) { g.input.inject('key', k); g.debug.advance(0.3); }
    const held = g.caster.sentence.length;
    g.input.inject('key', 'Backspace'); g.debug.advance(0.1);
    return [held === 2 && g.caster.sentence.length === 0 && g.player.focus === 100, 'held ' + held];`,

  'the stand runs three tides and opens the road': `
    g.debug.start(); g.debug.learnAll();
    const c = g.stands[0].def.center;
    g.debug.teleport(c.x, c.z); g.debug.advance(0.5);
    const st = g.stands[0];
    const sealed = st.seals.every((s) => s.collider !== null);
    let t = 0, casts = 0;
    while (st.phase !== 'won' && t < 240) {
      g.player.health = 100; // this check is about the stand, not survival
      const foe = g.enemies.list.filter((e) => e.alive).sort((a, b) => a.position.distanceTo(g.player.position) - b.position.distanceTo(g.player.position))[0];
      if (foe && g.player.focus >= 35) { const c = foe.chest; g.debug.lookAt(c.x, c.y, c.z); g.debug.say('fire', 'fire'); casts++; }
      g.debug.advance(1.0); t += 1.0;
    }
    return [sealed && st.phase === 'won' && st.seals.every((s) => s.collider === null) && g.knowledge.standsWon === 1,
      JSON.stringify({ phase: st.phase, wave: st.wave, seconds: t, casts, left: g.enemies.alive })];`,

  'the road is barred until the stand is won': `
    g.debug.start();
    const a = g.level.landmarks.way1, b = g.level.landmarks.way2;
    g.debug.teleport(a.x, a.z); g.debug.advance(0.5);
    let t = 0;
    while (t < 14 && Math.hypot(g.player.position.x - b.x, g.player.position.z - b.z) > 1.5) {
      g.debug.lookAt(b.x, g.player.position.y + 1.6, b.z);
      g.input.hold('KeyW', true); g.debug.advance(0.1); t += 0.1;
    }
    g.input.hold('KeyW', false);
    const got = Math.hypot(g.player.position.x - b.x, g.player.position.z - b.z);
    return [got > 20, JSON.stringify({ stillToGo: +got.toFixed(1), at: g.player.position.toArray().map((n) => +n.toFixed(1)) })];`,

  'once the stand is won, the road climbs the cliff to the gate': `
    g.debug.start(); g.debug.learnAll();
    const st = g.stands[0];
    st.phase = 'won';
    for (const s of st.seals) if (s.collider) { g.world.removeCollider(s.collider); s.collider = null; }
    const L = g.level.landmarks;
    const ways = Object.keys(L).filter((k) => /^path\\d+$/.test(k)).sort((a, b) => +a.slice(4) - +b.slice(4)).map((k) => L[k]);
    // from the sand just short of the causeway's foot, in line with it
    const back = ways[0].clone().sub(ways[1]).setY(0).normalize().multiplyScalar(2);
    g.debug.teleport(ways[0].x + back.x, ways[0].z + back.z); g.debug.advance(0.5);
    let t = 0, stuck = -1;
    for (let i = 1; i < ways.length; i++) {
      const w = ways[i];
      let leg = 0;
      while (leg < 12 && Math.hypot(g.player.position.x - w.x, g.player.position.z - w.z) > 1.0) {
        g.debug.lookAt(w.x, g.player.position.y + 1.6, w.z);
        g.input.hold('KeyW', true); g.debug.advance(0.1); leg += 0.1;
      }
      t += leg;
      if (leg >= 12) { stuck = i; break; }
    }
    const gate = L.gate;
    let k = 0;
    while (k < 8 && Math.hypot(g.player.position.x - gate.x, g.player.position.z - gate.z) > 1.5) {
      g.debug.lookAt(gate.x, g.player.position.y + 1.6, gate.z);
      g.input.hold('KeyW', true); g.debug.advance(0.1); k += 0.1;
    }
    g.input.hold('KeyW', false); g.debug.advance(0.2);
    const there = g.player.position.distanceTo(gate) < 4;
    return [stuck < 0 && there && g.player.health === 100 && g.atExit,
      JSON.stringify({ stuck, seconds: +(t + k).toFixed(1), there, atExit: g.atExit, hp: g.player.health, at: g.player.position.toArray().map((n) => +n.toFixed(1)), gate: gate.toArray().map((n) => +n.toFixed(1)) })];`,

  'dying returns you to the shore with what you know': `
    g.debug.start(); g.debug.learnAll(); g.debug.say('fire');
    const c = g.stands[0].def.center;
    g.debug.teleport(c.x, c.z); g.debug.advance(0.5);
    let t = 0;
    while (g.mode !== 'dead' && t < 160) { g.debug.advance(0.5); t += 0.5; }
    const died = g.mode === 'dead';
    g.debug.advance(4);
    const p = g.player.position;
    const home = p.distanceTo(g.level.spawn.position) < 3;
    return [died && g.mode === 'playing' && g.player.health === 100 && home && g.enemies.list.length === 0 && g.stands[0].phase === 'waiting'
      && g.knowledge.sigils.length === 4 && g.knowledge.sentences.includes('fire') && g.knowledge.deaths === 1,
      JSON.stringify({ died, after: t, mode: g.mode, home, deaths: g.knowledge.deaths })];`,

  'the Drowned take the long way round to reach the outcrop': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won';
    const top = g.level.landmarks.outcrop, foot = g.level.landmarks.outcropFoot;
    g.debug.teleport(top.x, top.z); g.debug.advance(0.2);
    const e = g.debug.spawn('drowned', foot.x, foot.z);
    const y = g.player.position.y;
    let t = 0, reached = false;
    while (t < 50 && !reached) { g.debug.advance(0.5); t += 0.5; reached = e.position.y > y - 0.6 && e.position.distanceTo(g.player.position) < 4; }
    return [reached && t > 5 && y - foot.y > 4, 'reached after ' + t + ' s (a straight line would take about 3); height ' + (y - foot.y).toFixed(1) + ' m; route ' + g.nav.reachable(foot.x, foot.z) + ', cost ' + Math.round(g.nav.cost(foot.x, foot.z))];`,

  'a pillar under your feet lifts you out of reach': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won'; // no tide; just one creature
    const o = g.level.landmarks.open;
    g.debug.teleport(o.x, o.z); g.player.pitch = -1.3; g.debug.advance(0.2);
    const y0 = g.player.position.y;
    g.debug.say('stone', 'stone'); g.debug.advance(1.0);
    const rise = g.player.position.y - y0;
    g.debug.spawn('drowned', o.x - 5, o.z - 2);
    g.debug.advance(9);
    const safe = g.player.health;
    g.debug.advance(8); // the pillar crumbles after 14 s
    return [rise > 3 && safe === 100 && g.player.position.y < y0 + 0.6, JSON.stringify({ rise: +rise.toFixed(2), safe, yAfter: +(g.player.position.y - y0).toFixed(2), hpAfter: Math.round(g.player.health) })];`,

  'the low ledge is not safe: the Drowned leap up to it': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won';
    const L = g.level.landmarks;
    // at the edge of it, where they can see you
    const ex = L.ledge.x + (L.ledgeFoot.x - L.ledge.x) * 0.4, ez = L.ledge.z + (L.ledgeFoot.z - L.ledge.z) * 0.4;
    g.debug.teleport(ex, ez); g.debug.advance(0.2);
    const ledge = g.player.position.y;
    const e = g.debug.spawn('drowned', L.ledgeFoot.x, L.ledgeFoot.z);
    const below = ledge - e.position.y;
    let t = 0, up = false;
    while (t < 20 && !up) { g.debug.advance(0.25); t += 0.25; up = e.position.y > ledge - 0.4; }
    return [below > 1.5 && below < 2.9 && up, JSON.stringify({ ledgeHeight: +below.toFixed(2), upAfter: t })];`,

  'a Gale throws a creature off the outcrop and the fall hurts it': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won';
    const top = g.level.landmarks.outcrop;
    g.debug.teleport(top.x - 1.2, top.z); g.debug.advance(0.2);
    const e = g.debug.spawn('drowned', top.x + 1.3, top.z);
    g.debug.advance(1.3);
    const y0 = e.position.y;
    g.debug.lookAt(e.position.x, e.position.y + 1, e.position.z);
    g.debug.say('wind', 'push'); g.debug.advance(3);
    return [e.position.y < y0 - 3 && e.hp < 80, JSON.stringify({ fell: +(y0 - e.position.y).toFixed(1), hp: Math.round(e.hp) })];`,

  'an updraft carries you up and sets you down unharmed, but still hurts what it throws': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won';
    const top = g.level.landmarks.outcrop, o = g.level.landmarks.open;
    g.debug.teleport(top.x, top.z); g.debug.advance(2);
    // off the outcrop on an updraft: a 5 m outcrop plus the lift is a fall that would otherwise hurt
    const y0 = g.player.position.y;
    g.player.pitch = -1.3; g.debug.say('wind', 'wind');
    let peak = y0, t = 0;
    g.input.hold('KeyW', true);
    while (t < 6) { g.debug.advance(0.1); t += 0.1; peak = Math.max(peak, g.player.position.y); }
    g.input.hold('KeyW', false);
    const dropped = y0 - g.player.position.y;
    const hp = g.player.health;
    // a plain fall from the same height does hurt
    g.debug.teleport(top.x, top.z); g.player.position.y += 9; g.debug.advance(3);
    const plain = g.player.health;
    // and a creature thrown up by one is hurt when it lands
    g.debug.teleport(o.x, o.z);
    const e = g.debug.spawn('drowned', o.x, o.z - 8); g.debug.advance(1.3);
    e.apply({ stagger: 2 }); // hold it still, so the test is about the fall and not the aim
    g.debug.lookAt(e.position.x, e.position.y, e.position.z); g.debug.say('wind', 'wind'); g.debug.advance(4);
    return [peak - y0 > 2.5 && hp === 100 && plain < 100 && e.hp < 80,
      JSON.stringify({ rose: +(peak - y0).toFixed(1), dropped: +dropped.toFixed(1), hpAfterUpdraft: hp, hpAfterPlainFall: Math.round(plain), creatureHp: Math.round(e.hp) })];`,

  'the sea throws you back': `
    g.debug.start(); g.debug.advance(2); // let the moment of grace after waking pass
    g.player.position.set(0, -2.2, 50); g.debug.advance(1.2);
    return [g.player.position.z < 30 && g.player.health < 100 && g.player.health > 70, JSON.stringify({ z: +g.player.position.z.toFixed(1), hp: g.player.health })];`,

  'spitters hurt you from range': `
    g.debug.start(); g.debug.learnAll();
    g.stands[0].phase = 'won';
    const o = g.level.landmarks.open;
    g.debug.teleport(o.x, o.z); g.debug.advance(0.2);
    g.debug.spawn('spitter', o.x, o.z - 14);
    g.debug.advance(9);
    return [g.player.health < 100, 'health ' + Math.round(g.player.health)];`,
};

const server = http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!path.extname(file)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const only = process.argv.slice(2);
  let failed = 0;
  for (const [name, body] of Object.entries(CHECKS)) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction('window.gloam !== undefined', null, { timeout: 600000 });
    let ok = false, detail = '';
    try {
      [ok, detail] = await page.evaluate(`(() => { const g = window.gloam; ${body} })()`);
    } catch (e) {
      detail = String(e.message || e).split('\n')[0];
    }
    if (errors.length) { ok = false; detail += ' | page errors: ' + errors.join('; '); }
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
    if (!ok) failed++;
    await page.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
});
