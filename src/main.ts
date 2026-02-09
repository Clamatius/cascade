import { computeLayout } from './types';
import { Renderer } from './renderer';
import { Input } from './input';
import { Game } from './game';
import { loadDictionary } from './dictionary';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);

let game: Game;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;

  // Cap game width at 500px CSS for desktop
  const maxW = Math.min(window.innerWidth, 500);
  const cssW = maxW;
  const cssH = window.innerHeight;

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const layout = computeLayout(canvas.width, canvas.height);
  game.setLayout(layout);
}

// Load dictionary, then start
loadDictionary().then(() => {
  game = new Game(renderer, input);
  resize();
  window.addEventListener('resize', resize);
  game.start();
}).catch(err => {
  console.error('Failed to load dictionary:', err);
  // Start anyway - scoring just won't work
  game = new Game(renderer, input);
  resize();
  window.addEventListener('resize', resize);
  game.start();
});
