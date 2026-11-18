import './ui/hud.css';
import { Game } from './game/game';
import { loadTextures } from './art/materials';
import { patchFog } from './world/coast/atmosphere';
import { buildWreckShore } from './world/wreckshore';

const container = document.getElementById('game')!;

// Scanned models and textures come first, so the shore is whole the moment you see it.
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div class="logo">Gloamtide</div><div class="meter"><i></i></div><div class="what">The tide is coming in…</div>';
container.appendChild(loading);
const meter = loading.querySelector('i') as HTMLElement;

const assets = import.meta.env.BASE_URL + 'assets/';
// the fog is patched before any material is made, so every one of them takes it
patchFog();
const parts = [0, 0];
const show = () => { meter.style.width = `${Math.round(((parts[0] + parts[1]) / 2) * 100)}%`; };
const [, level] = await Promise.all([
  loadTextures(assets, 8).then(() => { parts[0] = 1; show(); }),
  buildWreckShore(assets, (done, total) => { parts[1] = done / total; show(); }),
]);

const game = new Game(container, level);
await game.handsReady;
loading.remove();
game.run();

// handy in the browser console, and used by the automated checks
(window as unknown as { gloam: Game }).gloam = game;
