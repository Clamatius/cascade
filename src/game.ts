import {
  type Tile, type GamePhase, type GridPos, type LayoutMetrics,
  STAGGER_MS, WAVE_INTERVAL_MS, HAND_REFILL_MS,
  ROUND_DURATION_S, CLEAR_DISPLAY_MS,
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

  // Timers
  private roundTimer: number | null = null;
  private rafId: number | null = null;

  // Animation
  private floatingScores: FloatingScore[] = [];

  // Clearing phase
  private clearResults: RowResult[] = [];

  // Gravity
  private gravityRunning = false;
  private gravityTimers: number[] = [];

  // Hand refill timers: col → timer id
  private refillTimers = new Map<number, number>();

  // CASCADE intro
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

    this.input.onHandClick = (pos) => {
      if (this.phase !== 'playing') return;
      this.dropFromHand(pos);
    };

    this.input.onDrop = (_tile, from, to) => {
      if (from.row === 0 && to.row > 0) {
        this.scheduleHandRefill(from.col);
      }
      if (to.row > 0) {
        this.triggerGravity();
      }
    };
  }

  setLayout(layout: LayoutMetrics): void {
    this.layout = layout;
    this.renderer.setLayout(layout);
    this.input.setLayout(layout);

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

  // ── Round lifecycle ───────────────────────────────────────

  private startRound(): void {
    this.board.clearAll();
    this.score = 0;
    this.nextTileId = 0;
    this.timeLeft = ROUND_DURATION_S;
    this.floatingScores = [];
    this.clearResults = [];
    this.gravityRunning = false;
    this.gravityTimers = [];
    this.refillTimers.forEach(t => clearTimeout(t));
    this.refillTimers.clear();
    this.prng = new PRNG(Date.now());

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
      // All CASCADE letters placed - pause, then despawn and fill hand
      this.cascadeTimer = window.setTimeout(() => {
        this.board.clearAll();
        this.fillHand();
        this.input.setEnabled(true);
        this.roundTimer = window.setInterval(() => this.updateTimer(), 1000);
      }, 800);
    }
  }

  private fillHand(): void {
    for (let c = 0; c < ROW_WIDTHS[0]; c++) {
      if (this.board.isEmpty({ row: 0, col: c })) {
        const letter = this.prng.nextLetter();
        const tile = this.createTile(letter, { row: 0, col: c });
        tile.settled = true; // hand tiles don't auto-fall
        this.board.place(tile, { row: 0, col: c });
      }
    }
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

  private stopTimers(): void {
    if (this.roundTimer !== null) { clearInterval(this.roundTimer); this.roundTimer = null; }
    if (this.cascadeTimer !== null) { clearTimeout(this.cascadeTimer); this.cascadeTimer = null; }
    for (const t of this.gravityTimers) clearTimeout(t);
    this.gravityTimers = [];
    this.refillTimers.forEach(t => clearTimeout(t));
    this.refillTimers.clear();
  }

  // ── Hand / Drop ───────────────────────────────────────────

  private createTile(letter: string, pos: GridPos): Tile {
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

  private dropFromHand(pos: GridPos): void {
    const tile = this.board.get(pos);
    if (!tile) return;

    // Click → leftmost empty position on the board (rows 1+), left-to-right, top-to-bottom
    // This lets players spam-click in letter order and tiles cascade into place
    const target = this.findLeftmostEmpty();
    if (!target) return; // board full below hand

    // Move tile from hand to first fall position
    this.board.remove(tile);
    tile.settled = false;
    this.board.place(tile, target);
    playTileClick();

    // Schedule hand refill
    this.scheduleHandRefill(pos.col);

    // Trigger gravity to continue the fall
    this.triggerGravity();
  }

  private findLeftmostEmpty(): GridPos | null {
    for (let r = 1; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        if (this.board.isEmpty({ row: r, col: c })) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  }

  private scheduleHandRefill(col: number): void {
    const existing = this.refillTimers.get(col);
    if (existing !== undefined) clearTimeout(existing);

    const timer = window.setTimeout(() => {
      this.refillTimers.delete(col);
      if (this.phase !== 'playing') return;
      if (!this.board.isEmpty({ row: 0, col })) return;

      const letter = this.prng.nextLetter();
      const tile = this.createTile(letter, { row: 0, col });
      tile.settled = true;
      this.board.place(tile, { row: 0, col });

      // Check if board is now full (hand tile filled the last spot)
      if (this.board.isFull()) {
        this.evaluateBoard();
      }
    }, HAND_REFILL_MS);

    this.refillTimers.set(col, timer);
  }

  // ── Staggered gravity ─────────────────────────────────────

  private triggerGravity(): void {
    if (this.gravityRunning) return;
    this.gravityRunning = true;
    this.runGravityWave();
  }

  private runGravityWave(): void {
    if (this.phase !== 'playing') {
      this.gravityRunning = false;
      return;
    }

    // Collect tiles that might fall (skip row 0 = hand, skip last row = bottom)
    // Bottom-to-top so lower tiles move first, left-to-right for stagger sound
    const fallable: { tile: Tile; from: GridPos }[] = [];

    for (let r = NUM_ROWS - 2; r >= 1; r--) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const tile = this.board.grid[r][c];
        if (!tile) continue;
        // Pre-check: any empty in next row?
        if (this.board.emptyInRow(r + 1).length > 0) {
          fallable.push({ tile, from: { ...tile.pos } });
        }
      }
    }

    // Sort by column for left-to-right stagger, bottom-first within column
    fallable.sort((a, b) => a.from.col - b.from.col || b.from.row - a.from.row);

    if (fallable.length === 0) {
      this.gravityRunning = false;
      this.onGravitySettled();
      return;
    }

    // Execute with stagger - compute actual target at execution time
    // so earlier moves in this wave affect later ones
    let i = 0;
    let anyMoved = false;
    const waveStartTime = performance.now();

    const executeNext = () => {
      while (i < fallable.length) {
        const { tile, from } = fallable[i];
        i++;

        // Re-validate: tile still at 'from'
        if (this.board.get(from) !== tile) continue;

        // Find leftmost empty in next row (computed NOW, after prior moves)
        const nextRow = from.row + 1;
        const emptyCols = this.board.emptyInRow(nextRow);
        if (emptyCols.length === 0) continue;

        const to: GridPos = { row: nextRow, col: emptyCols[0] };
        this.board.set(from, null);
        this.board.place(tile, to);
        tile.settled = false;
        anyMoved = true;
        playTileClick();

        if (i < fallable.length) {
          const t = window.setTimeout(executeNext, STAGGER_MS);
          this.gravityTimers.push(t);
        } else {
          // Wave done - if anything moved, schedule another wave
          const elapsed = performance.now() - waveStartTime;
          const delay = Math.max(WAVE_INTERVAL_MS - elapsed, 100);
          const t = window.setTimeout(() => this.runGravityWave(), delay);
          this.gravityTimers.push(t);
        }
        return;
      }

      // No valid moves executed in this pass
      if (!anyMoved) {
        this.gravityRunning = false;
        this.onGravitySettled();
      } else {
        // Some moved but remaining were invalid - schedule next wave
        const elapsed = performance.now() - waveStartTime;
        const delay = Math.max(WAVE_INTERVAL_MS - elapsed, 100);
        const t = window.setTimeout(() => this.runGravityWave(), delay);
        this.gravityTimers.push(t);
      }
    };

    executeNext();
  }

  private onGravitySettled(): void {
    // Mark all non-hand tiles as settled
    for (let r = 1; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const tile = this.board.grid[r][c];
        if (tile) tile.settled = true;
      }
    }

    // Check if board is full
    if (this.board.isFull()) {
      this.evaluateBoard();
    }
  }

  // ── Board evaluation ──────────────────────────────────────

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
      this.fillHand();
      this.input.setEnabled(true);

      if (this.timeLeft > 0) {
        this.roundTimer = window.setInterval(() => this.updateTimer(), 1000);
      } else {
        this.endRound();
      }
    }, CLEAR_DISPLAY_MS);
  }

  // ── Render loop ───────────────────────────────────────────

  private startRenderLoop(): void {
    const render = () => {
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

    // Draw dragged tile on top (if removed from board, it won't be in allTiles)
    const drag = this.input.getDrag();
    if (drag && !tiles.includes(drag.tile)) {
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
