// Drive the built game in headless Chromium and take screenshots, for checking changes without a GPU.
// Usage: npm run build && node tools/look.cjs <outDir> [scenario ...]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };

// Each scenario runs inside the page with `g` = the game.
const SCENARIOS = {
  title: `g.debug.render()`,
  wake: `g.debug.start(); g.debug.advance(0.5);`,
  // the concept frames' cameras, for comparing the game with them
  cwaking: `g.debug.start(); g.debug.teleport(10, 12); g.debug.advance(0.3); g.debug.lookAt(-160, 22, 130);`,
  cwakinglight: `g.debug.start(); g.setEffects('light', false); g.debug.teleport(10, 12); g.debug.advance(0.3); g.debug.lookAt(-160, 22, 130);`,
  cnoao: `g.debug.start(); g.grounding.enabled = false; g.debug.teleport(10, 12); g.debug.advance(0.3); g.debug.lookAt(-160, 22, 130);`,
  cnobloom: `g.debug.start(); g.bloom.enabled = false; g.debug.teleport(10, 12); g.debug.advance(0.3); g.debug.lookAt(-160, 22, 130);`,
  cnofog: `g.debug.start(); g.sky.setNight = () => {}; g.world.scene.fog.density = 0.00001; g.debug.teleport(10, 12); g.debug.advance(0.3); g.debug.lookAt(-160, 22, 130);`,
  turn1: `g.debug.start(); g.stands[0].phase = 'won'; for (const s of g.stands[0].seals) if (s.collider) { g.world.removeCollider(s.collider); s.collider = null; }
    const a = g.level.landmarks.way2, b = g.level.landmarks.way3; g.debug.teleport(a.x + 4, a.z + 1.2); g.debug.advance(0.3); g.debug.lookAt(b.x, b.y + 1.5, b.z);`,
  causeway: `g.debug.start(); const a = g.level.landmarks.way0, b = g.level.landmarks.way1; g.debug.teleport(a.x + 3, a.z + 2.5); g.debug.advance(0.3); g.debug.lookAt(b.x, b.y, b.z);`,
  turn2: `g.debug.start(); g.stands[0].phase = 'won'; for (const s of g.stands[0].seals) if (s.collider) { g.world.removeCollider(s.collider); s.collider = null; }
    const a = g.level.landmarks.path33, b = g.level.landmarks.path36; g.debug.teleport(a.x, a.z); g.debug.advance(0.3); g.debug.lookAt(b.x, b.y + 1.5, b.z);`,
  fight: `g.debug.start(); g.debug.learnAll(); const c = g.stands[0].def.center; g.debug.teleport(c.x - 10, c.z + 4); g.debug.advance(0.5);
    g.debug.teleport(c.x - 4, c.z + 2); g.debug.advance(6); const e = g.enemies.list.find((x) => x.alive); if (e) g.debug.lookAt(e.position.x, e.position.y + 1.2, e.position.z);`,
  roadview: `g.debug.start(); const p = g.level.landmarks.path30; const q = g.level.landmarks.path44; g.debug.teleport(p.x, p.z); g.debug.advance(0.3); g.debug.lookAt(q.x, q.y + 1.5, q.z);`,
  outcrop: `g.debug.start(); const o = g.level.landmarks.outcrop; g.debug.teleport(o.x - 14, o.z + 9); g.debug.advance(0.3); g.debug.lookAt(o.x, o.y - 1, o.z);`,
  cbeach: `g.debug.start(); g.debug.teleport(95, 2); g.debug.advance(0.3); g.debug.lookAt(-150, 20, 70);`,
  croad: `g.debug.start(); g.debug.teleport(128, 6); g.debug.advance(0.3); g.debug.lookAt(150, 30, -40);`,
  stand: `g.debug.start(); g.debug.learnAll(); g.debug.teleport(104, 4); g.debug.advance(0.3); g.debug.lookAt(140, 6, -20);`,
  gate: `g.debug.start(); const p = g.level.landmarks.roadTop; g.debug.teleport(p.x - 8, p.z - 3); g.debug.advance(0.3); const q = g.level.landmarks.gate; g.debug.lookAt(q.x, q.y + 3, q.z);`,
  body: `g.debug.start(); g.debug.teleport(5.6, 24.6, 0.55, -0.62); g.debug.advance(0.3);`,
  stern: `g.debug.start(); g.debug.teleport(12, 12, 1.1, 0.25); g.debug.advance(0.3);`,
  lee: `g.debug.start(); g.debug.teleport(6, -3.5, 2.2, -0.12); g.debug.advance(0.3);`,
  hull: `g.debug.start(); g.debug.teleport(-13, 14.5, -0.35, -0.1); g.debug.advance(0.3);`,
  rocks: `g.debug.start(); g.debug.teleport(20, -9, 0.2, -0.25); g.debug.advance(0.3);`,
  ship: `g.debug.start(); g.debug.teleport(14, 24, 0.75, 0.12); g.debug.advance(0.3);`,
  deck: `g.debug.start(); g.debug.teleport(-4.6, 5.2, 1.4, -0.1); g.debug.advance(0.5);`,
  dunes: `g.debug.start(); g.debug.teleport(16, -10, 0.9, -0.05); g.debug.advance(0.3);`,
  sandline: `g.debug.start(); g.debug.teleport(1, 13, 0.35, -0.3); g.debug.advance(0.3);`,
  drift: `g.debug.start(); g.debug.teleport(15, 3, 1.3, -0.3); g.debug.advance(0.3);`,
  sea: `g.debug.start(); g.debug.teleport(-4, 18, 2.6, -0.06); g.debug.advance(0.3);`,
  beach: `g.debug.start(); g.debug.teleport(6, 14, 0.5, -0.02); g.debug.advance(0.3);`,
  wreck: `g.debug.start(); g.debug.teleport(2, 6, 1.2, 0.05); g.debug.advance(0.3);`,
  ravine: `g.debug.start(); g.debug.teleport(0, -24, 0, 0); g.debug.advance(0.3);`,
  cove: `g.debug.start(); g.debug.learnAll(); g.debug.teleport(-6, -50, 0.1, -0.05); g.debug.advance(4.2);`,
  mesa: `g.debug.start(); g.debug.learnAll(); g.debug.teleport(13, -82, 2.4, -0.3); g.debug.advance(6);`,
  crew: `g.debug.start(); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(0, -56, 0, -0.05);
    for (const [k, x, z] of [['drowned', -1.6, -58.6], ['drowned', 0.2, -59.4], ['drowned', 1.7, -58.8], ['spitter', 3.4, -60.5]]) g.debug.spawn(k, x, z);
    g.debug.advance(1.5);`,
  crewclose: `g.debug.start(); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(0, -56, 0, -0.1);
    const e1 = g.debug.spawn('drowned', -0.9, -58.3); const e2 = g.debug.spawn('spitter', 1.1, -58.6);
    g.debug.advance(1.25);`,
  nightship: `g.debug.start(); g.debug.night(1); g.debug.teleport(12, 12, 1.1, 0.25); g.debug.advance(0.3);`,
  nightsea: `g.debug.start(); g.debug.night(1); g.debug.teleport(-4, 18, 2.6, -0.03); g.debug.advance(0.3);`,
  nightcove: `g.debug.start(); g.debug.night(1); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(0, -56, 0, -0.05);
    for (const [k, x, z] of [['drowned', -1.6, -59.6], ['drowned', 0.2, -60.4], ['drowned', 1.7, -59.8], ['spitter', 3.4, -62.5]]) g.debug.spawn(k, x, z);
    g.debug.advance(1.2); g.input.inject('key', 'ArrowUp'); g.debug.advance(0.5);`,
  halfnight: `g.debug.start(); g.debug.night(0.5); g.debug.teleport(0, -24, 0, 0); g.debug.advance(0.3);`,
  waking: `g.debug.start(); g.view.wake(); g.debug.advance(1.75);`,
  fireball: `g.debug.start(); g.debug.learnAll(); g.debug.teleport(0, -56, 0, -0.08);
    for (const [x, z] of [[-2, -66], [1, -67], [3, -65], [0, -69]]) g.debug.spawn('drowned', x, z);
    g.debug.advance(1.4); g.debug.lookAt(0.5, 5.6, -66.5); g.debug.say('fire', 'fire'); g.debug.advance(0.5);`,
  pillar: `g.debug.start(); g.debug.learnAll(); g.debug.teleport(8, -64, 0.3, -1.2); g.debug.advance(0.2);
    g.debug.say('stone', 'stone'); g.debug.advance(1.2); g.player.pitch = -0.25; g.debug.spawn('drowned', 4, -70); g.debug.spawn('drowned', 6, -72); g.debug.advance(3);`,
  wave: `g.debug.start(); g.debug.night(1); g.debug.learnAll(); g.debug.teleport(0, -58, 0, -0.1);
    for (const [x, z] of [[-2, -64], [1, -65], [3, -63]]) g.debug.spawn('drowned', x, z);
    g.debug.advance(1.6); g.debug.say('fire', 'push'); g.debug.advance(0.22);`,
  speak: `g.debug.start(); g.debug.night(1); g.debug.learnAll(); g.debug.teleport(-2, -52, 0.1, -0.02);
    for (const [x, z] of [[-3, -60], [1, -62], [4, -59]]) g.debug.spawn('drowned', x, z);
    g.debug.spawn('spitter', -1, -68);
    g.debug.advance(2.0); g.input.inject('key', 'ArrowUp'); g.debug.advance(0.25); g.input.inject('key', 'ArrowRight'); g.debug.advance(0.3);`,
  climb: `g.debug.start(); g.debug.night(1); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(6, -66, 0.9, -0.1);
    for (const [x, z] of [[-4, -70], [-1, -73], [-6, -66]]) g.debug.spawn('drowned', x, z);
    g.debug.advance(1.3); g.player.pitch = -1.3; g.debug.say('stone', 'stone'); g.debug.advance(1.6);
    g.debug.lookAt(-3, 4.6, -70); g.debug.advance(0.4);`,
  gale: `g.debug.start(); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(13, -83, 0, 0);
    for (const [x, z] of [[12, -79.6], [14, -79.2], [13, -78.4]]) g.debug.spawn('drowned', x, z);
    g.debug.advance(1.3); g.debug.lookAt(13, 11, -79); g.debug.say('wind', 'push'); g.debug.advance(0.3);`,
  journal: `g.debug.start(); g.debug.teleport(4.4, 23.6, -0.6, -0.5); g.debug.advance(0.3); g.input.inject('key', 'KeyE'); g.debug.advance(0.1);`,
};

// The hand pose sheet: every held sign and every beat of every cast gesture.
const POSES = [
  ['idle', 'idle'], ['hold:fire', 'idle'], ['hold:stone', 'idle'], ['hold:wind', 'idle'], ['hold:push', 'idle'],
  ['hold:fire', 'hold:push'], ['hold:stone', 'hold:wind'],
  ['beat:thrust:0', 'idle'], ['beat:thrust:0', 'beat:thrust:0'], ['beat:hurl:0', 'idle'], ['beat:hurl:1', 'idle'],
  ['beat:slash:0', 'idle'], ['beat:slash:1', 'idle'], ['beat:shove:0', 'beat:shove:0'],
  ['beat:sweep:0', 'beat:sweep:0'], ['beat:sweep:1', 'beat:sweep:1'], ['beat:press:0', 'beat:press:0'],
  ['beat:raise:0', 'beat:raise:0'], ['beat:raise:1', 'beat:raise:1'], ['beat:loft:0', 'beat:loft:0'], ['beat:loft:1', 'beat:loft:1'],
];
for (const [l, r] of POSES) {
  SCENARIOS['pose-' + l.replace(/:/g, '_') + '--' + r.replace(/:/g, '_')] =
    `g.debug.start(); g.debug.teleport(0, -20, 0, 0.05); g.debug.hands('${l}', '${r}'); g.debug.advance(0.1);`;
}

const args = process.argv.slice(2);
const outDir = path.resolve(args.shift() || 'shots');
const names = args.length ? args.flatMap((a) => (a === 'poses' ? Object.keys(SCENARIOS).filter((n) => n.startsWith('pose-')) : [a])) : Object.keys(SCENARIOS).filter((n) => !n.startsWith('pose-'));
const size = { width: 1280, height: 720 };

const server = http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (file.endsWith(path.sep) || !path.extname(file)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(outDir, { recursive: true });
  let failed = false;
  for (const name of names) {
    const page = await browser.newPage({ viewport: size });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction('window.gloam !== undefined', null, { timeout: 600000 }).catch(() => errors.push('game never started'));
    await page.waitForTimeout(2500); // textures and sky
    await page.evaluate('window.gloam.handsReady').catch(() => {});
    const t = Date.now();
    try {
      const info = await page.evaluate(`(() => { const g = window.gloam; ${SCENARIOS[name]}; g.debug.render();
        return { pos: g.player.position.toArray().map((n) => +n.toFixed(2)), hp: Math.round(g.player.health), focus: Math.round(g.player.focus), foes: g.enemies.list.map((e) => e.kind + ':' + Math.round(e.hp)).join(' '), mode: g.mode }; })()`);
      console.log(name, JSON.stringify(info), `${Date.now() - t} ms`);
    } catch (e) {
      errors.push(String(e.message || e));
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 85, timeout: 180000 });
    if (errors.length) { failed = true; console.log(`  [${name}] errors:\n   ` + [...new Set(errors)].join('\n   ')); }
    await page.close();
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
});
