// Entry point: /index.html?shot=<name>&w=1920&h=1080
import { SHOTS } from './shots.js';

const params = new URLSearchParams(location.search);
const name = params.get('shot') || 'keyart';
const width = Number(params.get('w')) || 1920;
const height = Number(params.get('h')) || 1080;

const frame = document.getElementById('frame');
frame.style.width = width + 'px';
frame.style.height = height + 'px';

async function run() {
  const shot = SHOTS[name];
  if (!shot) throw new Error(`Unknown shot "${name}". Try: ${Object.keys(SHOTS).join(', ')}`);
  await document.fonts.ready;
  const stage = await shot({ width, height, params, frame });
  if (stage) {
    frame.prepend(stage.renderer.domElement);
    stage.render();
  }
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  window.__done = true;
}

run().catch((err) => {
  console.error(err);
  window.__error = String(err && err.stack || err);
  window.__done = true;
});
