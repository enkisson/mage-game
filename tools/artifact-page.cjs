// Writes dist/play.html: the built game as a page fragment for hosts that supply their own
// <html> shell, plus dist/play-files.json listing every file the page needs beside it.
// Usage: npm run build && node tools/artifact-page.cjs
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/);
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/);
if (!js || !css) throw new Error('could not find the built script and stylesheet in dist/index.html');

fs.writeFileSync(path.join(dist, 'play.html'), `<title>Gloamtide</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${css[1]}">
<style>
  body { background: #05040c; color: #e2dbc6; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
</style>
<div id="game"></div>
<script type="module" src="${js[1]}"></script>
`);

const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (!name.endsWith('.md') && !name.endsWith('.woff')) files.push(path.relative(dist, full).split(path.sep).join('/'));
  }
};
walk(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'play-files.json'), JSON.stringify(files.map((p) => ({ path: p })), null, 1));
console.log(`dist/play.html + ${files.length} files`);
console.log(files.join('\n'));
