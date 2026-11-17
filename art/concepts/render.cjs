// Paint the concept images. Each scene in scenes/ is painted in headless Chromium by the kit
// in kit.js and written to out/<scene>.jpg.
//   node render.cjs                 every scene, full size
//   node render.cjs waking ring     just these
//   node render.cjs --scale 0.5     quick half-size previews (out/preview-<scene>.jpg)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const at = args.indexOf('--scale');
const scale = at >= 0 ? Number(args.splice(at, 2)[1]) : 1;
const all = fs.readdirSync(path.join(__dirname, 'scenes')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
const names = args.length ? args : all;
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  for (const name of names) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log(name, 'page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'log') console.log(name, m.text()); });
    await page.setContent('<!doctype html><html><body></body></html>');
    for (const f of ['kit.js', 'common.js', `scenes/${name}.js`]) await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, f), 'utf8') });
    const t = Date.now();
    const url = await page.evaluate(async (s) => {
      K.begin(s);
      const canvas = await window.SCENE();
      return canvas.toDataURL('image/jpeg', 0.92);
    }, scale);
    const file = path.join(outDir, (scale === 1 ? '' : 'preview-') + name + '.jpg');
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(1)} s -> ${path.relative(process.cwd(), file)}`);
    await page.close();
  }
  await browser.close();
})();
