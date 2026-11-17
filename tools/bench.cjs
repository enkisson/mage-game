// Measure where a frame's time goes, by drawing the same view with parts switched off.
// Software rendering here, so the numbers are relative, not what a real GPU would take;
// they are dominated by per-pixel work, which is also what a laptop GPU is short of.
//   npm run build && node tools/bench.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!path.extname(file)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const run = async () => {
  const g = window.gloam;
  await g.handsReady;
  const gl = g.renderer.getContext();
  const px = new Uint8Array(4);
  const time = (n = 6) => {
    g.debug.render();
    let best = 1e9, sum = 0;
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      g.debug.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const d = performance.now() - t;
      best = Math.min(best, d); sum += d;
    }
    return Math.round(best);
  };
  const out = {};
  const scenes = {
    beach: () => { g.debug.start(); g.debug.night(0.2); g.debug.teleport(2.4, 25, 0, 0); g.debug.advance(6); },
    fight: () => {
      g.debug.night(1); g.debug.learnAll(); g.stands[0].phase = 'won'; g.debug.teleport(0, -56, 0, -0.05);
      for (const [k, x, z] of [['drowned', -1.6, -59.6], ['drowned', 0.2, -60.4], ['drowned', 1.7, -59.8], ['drowned', -3, -62], ['drowned', 4, -63], ['spitter', 3.4, -62.5]]) g.debug.spawn(k, x, z);
      g.debug.advance(1.2); g.input.inject('key', 'ArrowUp'); g.debug.advance(0.5);
    },
  };
  for (const [name, set] of Object.entries(scenes)) {
    set();
    const r = {};
    g.setRung(4); r.fineEdges = time();
    g.setRung(3); r.all = time();
    const info = g.renderer.info;
    g.renderer.info.autoReset = false; info.reset(); g.debug.render();
    r.calls = info.render.calls; r.tris = info.render.triangles; info.autoReset = true;
    r.programs = info.programs.length;
    if (g.grounding) { g.grounding.enabled = false; r.noAO = time(); g.grounding.enabled = true; }
    if (g.bloom) { g.bloom.enabled = false; r.noBloom = time(); g.bloom.enabled = true; }
    const key = g.sky.key;
    key.castShadow = false; r.noShadowPass = time(); key.castShadow = true;
    const fxv = [g.fx.glow.points.visible, g.fx.dust.points.visible];
    g.fx.glow.points.visible = g.fx.dust.points.visible = false; r.noParticles = time();
    g.fx.glow.points.visible = fxv[0]; g.fx.dust.points.visible = fxv[1];
    const hands = g.view.rig; hands.visible = false; r.noHands = time(); hands.visible = true;
    out[name] = r;
  }
  // how long the simulation and the hands take, with no drawing
  const t0 = performance.now();
  g.debug.advance(2);
  out.simMsPerStep = +((performance.now() - t0) / 120).toFixed(2);
  return out;
};

server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  const t = Date.now();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction('window.gloam !== undefined', null, { timeout: 90000 });
  console.log('load ms', Date.now() - t);
  console.log(JSON.stringify(await page.evaluate(run), null, 1));
  await browser.close();
  server.close();
});
