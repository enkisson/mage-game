import './ui/hud.css';
import { Game } from './game/game';
import { loadModels } from './art/models';
import { loadTextures } from './art/materials';

const container = document.getElementById('game')!;

// Scanned models and textures come first, so the shore is whole the moment you see it.
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div class="logo">Gloamtide</div><div class="meter"><i></i></div><div class="what">The tide is coming in…</div>';
container.appendChild(loading);
const meter = loading.querySelector('i') as HTMLElement;

const assets = import.meta.env.BASE_URL + 'assets/';
const [models] = await Promise.all([
  loadModels(assets + 'models/', 8, (done, total) => { meter.style.width = `${Math.round((done / total) * 100)}%`; }),
  loadTextures(assets, 8),
]);

const game = new Game(container, models);
await game.handsReady;
loading.remove();
game.run();

// handy in the browser console, and used by the automated checks
(window as unknown as { gloam: Game }).gloam = game;
