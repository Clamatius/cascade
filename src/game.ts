import {
  type Tile, type GamePhase, type GridPos, type LayoutMetrics,
  FALL_TICK_MS, HAND_REFILL_MS,
  ROUND_DURATION_S, CLEAR_DISPLAY_MS,
  NUM_ROWS, ROW_WIDTHS,
  PRNG, gridToPixel,
} from './types';
import { Board } from './board';
import { Renderer } from './renderer';
import { Input } from './input';
import { isWord, isDictionaryLoaded } from './dictionary';
import { playTileClick, playWordArpeggio, playBoardClear, playPerfectBoard, resumeAudio, isMuted, toggleMute } from './audio';

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

  // High scores
  private highScores: number[] = [];
  private isNewHigh = false;
  private static readonly STORAGE_KEY = 'cascade-high-scores';
  private static readonly MAX_SCORES = 10;

  // Timers
  private roundTimer: number | null = null;
  private rafId: number | null = null;

  // Animation
  private floatingScores: FloatingScore[] = [];

  // Clearing phase
  private clearResults: RowResult[] = [];
  private clearStartTime = 0;
  private isPerfectBoard = false;
  private _clearProgress = -1;


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
    this.highScores = this.loadHighScores();

    this.input.setBoard(this.board);

    this.input.onTap = () => this.handleTap();

    this.input.onHandClick = (pos) => {
      if (this.phase !== 'playing') return;
      this.dropFromHand(pos);
    };

    this.input.onDrop = (tile, from, to) => {
      if (from.row === 0 && to.row > 0) {
        this.scheduleHandRefill(from.col);
      }
      if (to.row > 0 && to.row < NUM_ROWS - 1) {
        tile.nextFallAt = performance.now() + FALL_TICK_MS;
      }
    };

    this.input.muteHitTest = (x, y) => {
      const hit = this.renderer.getMuteHitArea();
      return x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h;
    };

    this.input.onMuteClick = () => {
      toggleMute();
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
    this.isNewHigh = this.saveScore(this.score);
  }

  private stopTimers(): void {
    if (this.roundTimer !== null) { clearInterval(this.roundTimer); this.roundTimer = null; }
    if (this.cascadeTimer !== null) { clearTimeout(this.cascadeTimer); this.cascadeTimer = null; }
    this.refillTimers.forEach(t => clearTimeout(t));
    this.refillTimers.clear();
  }

  // ── High scores ─────────────────────────────────────────

  private loadHighScores(): number[] {
    try {
      const raw = localStorage.getItem(Game.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((n: unknown) => typeof n === 'number').slice(0, Game.MAX_SCORES);
    } catch { /* ignore corrupt data */ }
    return [];
  }

  /** Returns true if this score made the high score list */
  private saveScore(score: number): boolean {
    if (score <= 0) return false;
    this.highScores.push(score);
    this.highScores.sort((a, b) => b - a);
    this.highScores = this.highScores.slice(0, Game.MAX_SCORES);
    try {
      localStorage.setItem(Game.STORAGE_KEY, JSON.stringify(this.highScores));
    } catch { /* storage full or unavailable */ }
    return this.highScores.includes(score);
  }

  private get bestScore(): number {
    return this.highScores[0] ?? 0;
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
    tile.nextFallAt = performance.now() + FALL_TICK_MS;
    this.board.place(tile, target);
    playTileClick();

    // Schedule hand refill
    this.scheduleHandRefill(pos.col);
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

  // ── Per-tile gravity (called each frame) ─────────────────

  private processGravity(now: number): void {
    if (this.phase !== 'playing') return;

    let anySettled = false;

    // Bottom-to-top so lower tiles move first, freeing space
    for (let r = NUM_ROWS - 2; r >= 1; r--) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const tile = this.board.grid[r][c];
        if (!tile || tile.pos.row === 0) continue;

        const nextRow = r + 1;
        const emptyCols = this.board.emptyInRow(nextRow);

        if (emptyCols.length === 0) {
          // Can't fall - settle
          if (!tile.settled) {
            tile.settled = true;
            tile.nextFallAt = undefined;
            anySettled = true;
          }
          continue;
        }

        // Space below exists - start fall cadence if not already ticking
        if (tile.nextFallAt === undefined) {
          tile.nextFallAt = now + FALL_TICK_MS;
          tile.settled = false;
          continue;
        }

        // Not yet time to fall
        if (now < tile.nextFallAt) continue;

        // Time to fall one row
        const to: GridPos = { row: nextRow, col: emptyCols[0] };
        this.board.set(tile.pos, null);
        this.board.place(tile, to);
        tile.nextFallAt = now + FALL_TICK_MS;
        playTileClick();
      }
    }

    // Settle bottom-row tiles
    for (let c = 0; c < ROW_WIDTHS[NUM_ROWS - 1]; c++) {
      const tile = this.board.grid[NUM_ROWS - 1][c];
      if (tile && !tile.settled) {
        tile.settled = true;
        tile.nextFallAt = undefined;
        anySettled = true;
      }
    }

    // Check for board full after any settle
    if (anySettled && this.board.isFull()) {
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
    this.clearStartTime = performance.now();
    this.isPerfectBoard = false;
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

    // Audio feedback - arpeggios for each valid word, staggered
    const validResults = this.clearResults.filter(r => r.valid);
    const allValid = this.clearResults.length > 0 && validResults.length === this.clearResults.length;
    this.isPerfectBoard = allValid;

    // Perfect board gets 2x bonus
    if (allValid && roundScore > 0) {
      roundScore *= 2;
    }
    this.score += roundScore;

    if (allValid) {
      // PERFECT BOARD - the Peggle moment
      playPerfectBoard();
      this.floatingScores.push({
        x: this.layout.canvasW / 2,
        y: this.layout.canvasH * 0.55,
        text: `2x BONUS! +${roundScore}`,
        startTime: performance.now() + 400,
        duration: 2000,
      });
    } else {
      // Play word arpeggios for each valid word, staggered by 200ms
      validResults.forEach((result, idx) => {
        setTimeout(() => playWordArpeggio(result.word.length), idx * 200);
      });
    }

    // Board clear whoosh at end of display
    if (roundScore > 0) {
      setTimeout(() => playBoardClear(), CLEAR_DISPLAY_MS - 200);
    }

    // After display duration, clear board and resume
    const clearDelay = allValid ? CLEAR_DISPLAY_MS + 800 : CLEAR_DISPLAY_MS;
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
    }, clearDelay);
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
      this.renderer.drawStartScreen(isMuted());
      return;
    }

    // Per-tile gravity: move tiles whose fall timer has elapsed
    this.processGravity(now);

    this.renderer.drawSlots();

    // Interpolate tile positions toward grid targets
    const tiles = this.board.allTiles();
    for (const tile of tiles) {
      const target = gridToPixel(tile.pos, this.layout);
      const lerpSpeed = 0.25;
      tile.visualX += (target.x - tile.visualX) * lerpSpeed;
      tile.visualY += (target.y - tile.visualY) * lerpSpeed;
    }

    // Draw clearing highlights and word overlays
    if (this.phase === 'clearing') {
      const clearElapsed = now - this.clearStartTime;
      const clearDuration = this.isPerfectBoard ? CLEAR_DISPLAY_MS + 800 : CLEAR_DISPLAY_MS;
      const clearProgress = Math.min(clearElapsed / clearDuration, 1);

      for (const result of this.clearResults) {
        this.renderer.highlightRow(result.row, result.valid);
      }

      this._clearProgress = clearProgress;
    } else {
      this._clearProgress = -1;
    }

    // Draw drop target
    const dropTarget = this.input.getDropTarget();
    if (dropTarget) {
      this.renderer.highlightDropTarget(dropTarget);
    }

    // Draw tiles on board
    this.renderer.drawTiles(tiles);

    // Word overlays on top of tiles during clearing
    if (this._clearProgress >= 0 && this.clearResults.length > 0) {
      for (const result of this.clearResults) {
        this.renderer.drawWordOverlay(result.row, result.word, result.valid, this._clearProgress);
      }

      // Perfect board celebration effects
      if (this.isPerfectBoard) {
        // Flash in first 600ms
        if (this._clearProgress < 0.3) {
          this.renderer.drawPerfectFlash(this._clearProgress / 0.3);
        }
        // Floating text for most of the duration
        this.renderer.drawPerfectText(this._clearProgress);
      }
    }

    // Draw dragged tile on top (if removed from board, it won't be in allTiles)
    const drag = this.input.getDrag();
    if (drag && !tiles.includes(drag.tile)) {
      this.renderer.drawTile(drag.tile, 0.85);
    }

    // HUD
    this.renderer.drawHUD(this.score, this.timeLeft, this.phase, this.bestScore, isMuted());

    // Floating scores
    this.floatingScores = this.floatingScores.filter(fs => {
      const elapsed = now - fs.startTime;
      if (elapsed > fs.duration) return false;
      this.renderer.drawFloatingScore(fs.x, fs.y, fs.text, elapsed / fs.duration);
      return true;
    });

    // Round end overlay
    if (this.phase === 'roundEnd') {
      this.renderer.drawRoundEnd(this.score, this.bestScore, this.isNewHigh, this.highScores);
    }
  }

  destroy(): void {
    this.stopTimers();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
