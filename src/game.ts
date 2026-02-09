import {
  type Tile, type GamePhase, type LayoutMetrics,
  TICK_MS, SPAWN_MS, ROUND_DURATION_S, CLEAR_DISPLAY_MS,
  NUM_ROWS, ROW_WIDTHS,
  PRNG, gridToPixel,
} from './types';
import { Board } from './board';
import { Renderer } from './renderer';
import { Input } from './input';
import { isWord, isDictionaryLoaded } from './dictionary';
import { playTileClick, playScoreChime, resumeAudio } from './audio';

interface FloatingScore {
  x: number;
  y: number;
  text: string;
  startTime: number;
  duration: number;
}

interface RowResult {
  row: number;
  word: string;
  valid: boolean;
  score: number;
}

export class Game {
  private board: Board;
  private renderer: Renderer;
  private input: Input;
  private layout!: LayoutMetrics;
  private prng: PRNG;

  private phase: GamePhase = 'start';
  private score = 0;
  private timeLeft = ROUND_DURATION_S;
  private nextTileId = 0;

  // Tick timers
  private tickTimer: number | null = null;
  private spawnTimer: number | null = null;
  private roundTimer: number | null = null;

  // Animation
  private rafId: number | null = null;
  private floatingScores: FloatingScore[] = [];

  // Clearing phase
  private clearResults: RowResult[] = [];

  // CASCADE display
  private cascadeIndex = 0;
  private cascadeTimer: number | null = null;

  constructor(
    renderer: Renderer,
    input: Input,
  ) {
    this.board = new Board();
    this.renderer = renderer;
    this.input = input;
    this.prng = new PRNG(Date.now());

    this.input.setBoard(this.board);
    this.input.onTap = () => this.handleTap();
    this.input.onDrop = () => {
      // After a drop, tile is unsettled and will fall on next gravity tick
    };
  }

  setLayout(layout: LayoutMetrics): void {
    this.layout = layout;
    this.renderer.setLayout(layout);
    this.input.setLayout(layout);

    // Update visual positions of all existing tiles
    for (const tile of this.board.allTiles()) {
      const px = gridToPixel(tile.pos, layout);
      tile.visualX = px.x;
      tile.visualY = px.y;
    }
  }

  start(): void {
    this.phase = 'start';
    this.input.setEnabled(false);
    this.startRenderLoop();
  }

  private handleTap(): void {
    if (this.phase === 'start') {
      resumeAudio();
      this.startRound();
    } else if (this.phase === 'roundEnd') {
      this.startRound();
    }
  }

  private startRound(): void {
    this.board.clearAll();
    this.score = 0;
    this.nextTileId = 0;
    this.timeLeft = ROUND_DURATION_S;
    this.floatingScores = [];
    this.clearResults = [];
    this.prng = new PRNG(Date.now());

    // Show CASCADE in top row first
    this.phase = 'playing';
    this.input.setEnabled(false);
    this.cascadeIndex = 0;
    this.showCascadeLetters();
  }

  private showCascadeLetters(): void {
    const letters = ['C', 'A', 'S', 'C', 'A', 'D', 'E'];

    if (this.cascadeIndex < letters.length) {
      const tile = this.createTile(letters[this.cascadeIndex], { row: 0, col: this.cascadeIndex });
      this.board.place(tile, { row: 0, col: this.cascadeIndex });
      const px = gridToPixel(tile.pos, this.layout);
      tile.visualX = px.x;
      tile.visualY = px.y;
      tile.settled = true;
      playTileClick();

      this.cascadeIndex++;
      this.cascadeTimer = window.setTimeout(() => this.showCascadeLetters(), 120);
    } else {
      // All CASCADE letters placed, wait then start gravity
      this.cascadeTimer = window.setTimeout(() => {
        this.input.setEnabled(true);
        this.beginGameplay();
      }, 600);
    }
  }

  private beginGameplay(): void {
    // Start game clocks
    this.tickTimer = window.setInterval(() => this.gameTick(), TICK_MS);
    this.spawnTimer = window.setInterval(() => this.spawnTile(), SPAWN_MS);
    this.roundTimer = window.setInterval(() => this.updateTimer(), 1000);
  }

  private stopTimers(): void {
    if (this.tickTimer !== null) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.spawnTimer !== null) { clearInterval(this.spawnTimer); this.spawnTimer = null; }
    if (this.roundTimer !== null) { clearInterval(this.roundTimer); this.roundTimer = null; }
    if (this.cascadeTimer !== null) { clearTimeout(this.cascadeTimer); this.cascadeTimer = null; }
  }

  private updateTimer(): void {
    this.timeLeft--;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endRound();
    }
  }

  private endRound(): void {
    this.stopTimers();
    this.phase = 'roundEnd';
    this.input.setEnabled(false);
  }

  private createTile(letter: string, pos: { row: number; col: number }): Tile {
    const px = gridToPixel(pos, this.layout);
    return {
      id: this.nextTileId++,
      letter,
      pos: { ...pos },
      settled: false,
      visualX: px.x,
      visualY: px.y,
    };
  }

  private spawnTile(): void {
    if (this.phase !== 'playing') return;
    if (this.board.isFull()) return;

    const emptyCols = this.board.emptyInRow(0);
    if (emptyCols.length === 0) return;

    const col = emptyCols[this.prng.nextInt(emptyCols.length)];
    const letter = this.prng.nextLetter();
    const tile = this.createTile(letter, { row: 0, col });
    this.board.place(tile, { row: 0, col });
  }

  private gameTick(): void {
    if (this.phase !== 'playing') return;

    const moved = this.board.applyGravity();

    if (moved) {
      playTileClick();
    }

    // Check if board is full after gravity settles
    if (!moved && this.board.isFull()) {
      this.evaluateBoard();
    }
  }

  private evaluateBoard(): void {
    if (!isDictionaryLoaded()) return;

    this.phase = 'clearing';
    this.input.setEnabled(false);
    this.stopTimers();

    this.clearResults = [];
    let roundScore = 0;

    for (let r = 0; r < NUM_ROWS; r++) {
      const word = this.board.readRow(r);
      if (word.length === 0) continue;

      const valid = isWord(word);
      const score = valid ? Board.scoreWord(word) : 0;
      this.clearResults.push({ row: r, word, valid, score });

      if (valid && score > 0) {
        roundScore += score;
        // Add floating score at the row's center
        const midCol = Math.floor(ROW_WIDTHS[r] / 2);
        const px = gridToPixel({ row: r, col: midCol }, this.layout);
        this.floatingScores.push({
          x: px.x + this.layout.tileSize / 2,
          y: px.y,
          text: `+${score}`,
          startTime: performance.now(),
          duration: 1500,
        });
      }
    }

    this.score += roundScore;
    if (roundScore > 0) playScoreChime();
    // After display duration, clear board and resume
    setTimeout(() => {
      this.board.clearAll();
      this.clearResults = [];
      this.phase = 'playing';
      this.input.setEnabled(true);

      // Restart game clocks
      if (this.timeLeft > 0) {
        this.tickTimer = window.setInterval(() => this.gameTick(), TICK_MS);
        this.spawnTimer = window.setInterval(() => this.spawnTile(), SPAWN_MS);
        this.roundTimer = window.setInterval(() => this.updateTimer(), 1000);
      } else {
        this.endRound();
      }
    }, CLEAR_DISPLAY_MS);
  }

  // ── Render loop ───────────────────────────────────────────

  private startRenderLoop(): void {
    const render = (_now: number) => {
      this.renderFrame();
      this.rafId = requestAnimationFrame(render);
    };
    this.rafId = requestAnimationFrame(render);
  }

  private renderFrame(): void {
    const now = performance.now();
    this.renderer.clear();

    if (this.phase === 'start') {
      this.renderer.drawStartScreen();
      return;
    }

    this.renderer.drawSlots();

    // Interpolate tile positions toward grid targets
    const tiles = this.board.allTiles();
    for (const tile of tiles) {
      const target = gridToPixel(tile.pos, this.layout);
      const lerpSpeed = 0.25;
      tile.visualX += (target.x - tile.visualX) * lerpSpeed;
      tile.visualY += (target.y - tile.visualY) * lerpSpeed;
    }

    // Draw clearing highlights
    if (this.phase === 'clearing') {
      for (const result of this.clearResults) {
        this.renderer.highlightRow(result.row, result.valid);
      }
    }

    // Draw drop target
    const dropTarget = this.input.getDropTarget();
    if (dropTarget) {
      this.renderer.highlightDropTarget(dropTarget);
    }

    // Draw tiles on board
    this.renderer.drawTiles(tiles);

    // Draw dragged tile on top
    const drag = this.input.getDrag();
    if (drag) {
      this.renderer.drawTile(drag.tile, 0.85);
    }

    // HUD
    this.renderer.drawHUD(this.score, this.timeLeft, this.phase);

    // Floating scores
    this.floatingScores = this.floatingScores.filter(fs => {
      const elapsed = now - fs.startTime;
      if (elapsed > fs.duration) return false;
      this.renderer.drawFloatingScore(fs.x, fs.y, fs.text, elapsed / fs.duration);
      return true;
    });

    // Round end overlay
    if (this.phase === 'roundEnd') {
      this.renderer.drawRoundEnd(this.score);
    }
  }

  destroy(): void {
    this.stopTimers();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
