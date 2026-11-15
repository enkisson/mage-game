// Renders look-dev shots to ../concept/*.jpg using headless Chromium.
// Usage: node render.cjs [shot ...] [--out dir] [--scale 0.5]
// Needs Playwright with a Chromium build available (npx playwright install chromium).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = __dirname;
const SIZES = {
  keyart: [1920, 1080], draft: [1920, 1080], title: [1920, 1080], arena: [1920, 1080],
  lineup: [2400, 1000], staves: [1800, 1000],
  husk: [900, 1000], spitter: [900, 1000], brute: [900, 1000], wraith: [900, 1000], bloater: [900, 1000], tidecaller: [900, 1000],
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const outDir = path.resolve(flag('--out', path.join(root, '..', 'concept')));
const scale = Number(flag('--scale', 1));
const shots = args.length ? args : Object.keys(SIZES);

const server = http.createServer((req, res) => {
  const file = path.join(root, '..', decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(path.join(root, '..'))) { res.writeHead(403); return res.end(); }
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
  for (const shot of shots) {
    const [w, h] = (SIZES[shot] || [1920, 1080]).map((n) => Math.round(n * scale));
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', (e) => console.log(`[${shot}] page error: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${shot}] console: ${m.text()}`); });
    const t = Date.now();
    await page.goto(`http://127.0.0.1:${port}/lookdev/index.html?shot=${shot}&w=${w}&h=${h}`);
    await page.waitForFunction('window.__done === true', null, { timeout: 180000 });
    const error = await page.evaluate('window.__error');
    if (error) { console.log(`[${shot}] FAILED\n${error}`); failed = true; }
    const file = path.join(outDir, `${shot}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    console.log(`${shot} -> ${path.relative(process.cwd(), file)} (${w}x${h}, ${Date.now() - t} ms)`);
    await page.close();
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
});
