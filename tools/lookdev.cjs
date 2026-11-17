// Render look-dev stills from the built look-dev page (npm run build first).
//   node tools/lookdev.cjs sheet out.jpg name1 name2 ...   contact sheet of models
//   node tools/lookdev.cjs shot <name> out.jpg             one concept shot
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!path.extname(file)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const [mode, ...rest] = process.argv.slice(2);
server.listen(0, async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'log') console.log(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/lookdev.html`);
  await page.waitForFunction('window.LOOK !== undefined', null, { timeout: 60000 });
  const t = Date.now();
  if (mode === 'sheet') {
    const [out, ...names] = rest;
    const urls = await page.evaluate((n) => window.LOOK.sheet(n), names);
    // tile them
    const tiled = await page.evaluate(async ({ urls, names }) => {
      const cols = 4, w = 480, h = 270, c = document.createElement('canvas');
      c.width = cols * w; c.height = Math.ceil(urls.length / cols) * h;
      const x = c.getContext('2d');
      for (let i = 0; i < urls.length; i++) {
        const im = await new Promise((r) => { const e = new Image(); e.onload = () => r(e); e.src = urls[i]; });
        x.drawImage(im, (i % cols) * w, Math.floor(i / cols) * h, w, h);
        x.font = '16px sans-serif'; x.fillStyle = '#ffe14d'; x.fillText(names[i], (i % cols) * w + 8, Math.floor(i / cols) * h + 20);
      }
      return c.toDataURL('image/jpeg', 0.85);
    }, { urls, names });
    fs.writeFileSync(out, Buffer.from(tiled.split(',')[1], 'base64'));
  } else if (mode === 'probe') {
    console.log(JSON.stringify(await page.evaluate(() => window.LOOK.probe())));
  } else if (mode === 'shot') {
    const [name, out] = rest;
    const url = await page.evaluate((n) => window.LOOK.shot(n), name);
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`${mode} done in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await browser.close();
  server.close();
});
