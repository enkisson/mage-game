import { Game } from './game/game';

const container = document.getElementById('game')!;
const game = new Game(container);
game.run();

// handy in the browser console, and used by the automated checks
(window as unknown as { gloam: Game }).gloam = game;
