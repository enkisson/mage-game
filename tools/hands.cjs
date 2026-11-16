// Contact sheets of the hands, for judging poses and motion without a GPU.
//   node tools/hands.cjs <out.jpg> poses                 every held sign and gesture beat
//   node tools/hands.cjs <out.jpg> film fire push        speak and cast a sentence, frame by frame
// Run `npm run build` first.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };

const POSES = [
  ['idle', 'idle'], ['hold:fire', 'idle'], ['hold:stone', 'idle'], ['hold:wind', 'idle'], ['hold:push', 'idle'],
  ['hold:fire', 'hold:push'], ['hold:stone', 'hold:wind'], ['hold:wind', 'hold:fire'],
  ['beat:thrust:0', 'idle'], ['beat:thrust:0', 'beat:thrust:0'], ['beat:hurl:0', 'idle'], ['beat:hurl:1', 'idle'],
  ['beat:slash:0', 'idle'], ['beat:slash:1', 'idle'], ['beat:shove:0', 'beat:shove:0'], ['beat:press:0', 'beat:press:0'],
  ['beat:sweep:0', 'beat:sweep:0'], ['beat:sweep:1', 'beat:sweep:1'], ['beat:raise:0', 'beat:raise:0'], ['beat:raise:1', 'beat:raise:1'],
  ['beat:loft:0', 'beat:loft:0'], ['beat:loft:1', 'beat:loft:1'],
];

const [out = 'hands.jpg', mode = 'poses', ...words] = process.argv.slice(2);

// Runs in the page. Draws frames into one sheet and returns it as a data URL.
const sheet = async ({ mode, words, POSES }) => {
  const g = window.gloam;
  await g.handsReady;
  g.debug.start();
  g.debug.learnAll();
  g.debug.teleport(0, -20, 0, 0.02);
  g.debug.advance(0.3);
  const frames = [];
  const grab = (label) => frames.push({ label, url: g.debug.capture() });
  if (mode === 'poses') {
    for (const [l, r] of POSES) {
      g.debug.hands(l, r);
      g.debug.advance(0.05);
      grab(l === r ? l + ' ×2' : r === 'idle' ? l : l + ' + ' + r);
    }
  } else {
    const step = 1 / 30;
    const slots = words.map((w) => g.knowledge.bound.indexOf(w));
    const keys = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
    let t = 0;
    const run = (seconds, tag) => { for (let s = 0; s < seconds - 1e-6; s += step) { g.debug.advance(step); t += step; grab(tag + ' ' + t.toFixed(2)); } };
    run(0.07, 'idle');
    for (const [i, slot] of slots.entries()) { g.input.inject('key', keys[slot]); run(0.3, 'word ' + (i + 1)); }
    g.input.inject('click');
    run(0.8, 'cast');
  }
  const cols = mode === 'poses' ? 4 : 6;
  const first = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = frames[0].url; });
  const crop = { x: first.width * 0.1, y: first.height * 0.28, w: first.width * 0.8, h: first.height * 0.72 };
  const cw = mode === 'poses' ? 420 : 300, ch = Math.round(cw * crop.h / crop.w);
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = Math.ceil(frames.length / cols) * ch;
  const ctx = c.getContext('2d');
  for (const [i, f] of frames.entries()) {
    const im = await new Promise((res) => { const el = new Image(); el.onload = () => res(el); el.src = f.url; });
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    ctx.drawImage(im, crop.x, crop.y, crop.w, crop.h, x, y, cw, ch);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(f.label, x + 7, y + 17);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(f.label, x + 6, y + 16);
  }
  return c.toDataURL('image/jpeg', 0.86);
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
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction('window.gloam !== undefined', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const url = await page.evaluate(sheet, { mode, words, POSES });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', out);
  await browser.close();
  server.close();
});
