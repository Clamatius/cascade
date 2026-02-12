// ── Grid geometry ──────────────────────────────────────────────

export interface GridPos {
  row: number;
  col: number;
}

export interface Tile {
  id: number;
  letter: string;       // single letter or "Qu"
  pos: GridPos;
  settled: boolean;      // true when can't fall further
  // visual interpolation
  visualX: number;
  visualY: number;
  // per-tile gravity: timestamp when tile should next try to fall one row
  nextFallAt?: number;
  // animation timestamps
  settledAt?: number;    // when tile first settled (for bounce)
  spawnedAt?: number;    // when tile was created (for scale-in)
}

export type GamePhase = 'start' | 'playing' | 'clearing' | 'roundEnd';

// ── Board constants ───────────────────────────────────────────

export const ROW_WIDTHS = [7, 6, 5, 4, 3, 2] as const;
export const NUM_ROWS = ROW_WIDTHS.length;
export const TOTAL_POSITIONS = 27; // sum of ROW_WIDTHS

// ── Timing ────────────────────────────────────────────────────

export const FALL_TICK_MS = 350;     // per-tile: ms between each one-row fall step
export const HAND_REFILL_MS = 400;   // delay before empty hand slot gets a new tile
export const ROUND_DURATION_S = 120; // 2 minutes
export const CLEAR_DISPLAY_MS = 1200; // highlight duration before clear
export const BOUNCE_DURATION_MS = 200; // elastic settle bounce duration
export const BOUNCE_AMPLITUDE = 0.06;  // bounce overshoot as fraction of tileSize
export const SPAWN_SCALE_MS = 150;     // hand tile scale-in duration

// ── Scoring ───────────────────────────────────────────────────

export const SCRABBLE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, U: 1,
  R: 1, S: 1, T: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

export const LENGTH_MULTIPLIERS: Record<number, number> = {
  2: 1, 3: 1.5, 4: 2, 5: 3, 6: 4, 7: 6,
};

// ── Letter frequency (Scrabble distribution) ──────────────────

export const LETTER_FREQS: [string, number][] = [
  ['A', 9], ['B', 2], ['C', 2], ['D', 4], ['E', 12], ['F', 2],
  ['G', 3], ['H', 2], ['I', 9], ['J', 1], ['K', 1], ['L', 4],
  ['M', 2], ['N', 6], ['O', 8], ['P', 2], ['Qu', 1], ['R', 6],
  ['S', 4], ['T', 6], ['U', 4], ['V', 2], ['W', 2], ['X', 1],
  ['Y', 2], ['Z', 1],
];

// Build cumulative distribution
const totalFreq = LETTER_FREQS.reduce((s, [, f]) => s + f, 0);
export const LETTER_CDF: [string, number][] = [];
{
  let cum = 0;
  for (const [letter, freq] of LETTER_FREQS) {
    cum += freq / totalFreq;
    LETTER_CDF.push([letter, cum]);
  }
}

// ── Tile sizing (computed at runtime) ─────────────────────────

export interface LayoutMetrics {
  tileSize: number;       // tile width & height
  tilePad: number;        // gap between tiles
  boardX: number;         // left offset of row 0, col 0
  boardY: number;         // top offset of row 0
  canvasW: number;
  canvasH: number;
}

export function computeLayout(canvasW: number, canvasH: number): LayoutMetrics {
  // Reserve space for HUD (scales with canvas)
  const hudHeight = Math.max(canvasH * 0.07, 50);
  const availW = canvasW * 0.92;
  const availH = canvasH - hudHeight - canvasH * 0.02;

  // Row 0 has 7 tiles. Total width = 7 * tileSize + 6 * pad.
  // We want pad ≈ tileSize * 0.1
  const tileSize = Math.min(
    availW / (7 + 6 * 0.1),
    availH / (NUM_ROWS + (NUM_ROWS - 1) * 0.1)
  );
  const tilePad = tileSize * 0.1;

  const row0Width = 7 * tileSize + 6 * tilePad;
  const boardX = (canvasW - row0Width) / 2;
  const boardY = hudHeight;

  return { tileSize, tilePad, boardX, boardY, canvasW, canvasH };
}

// ── Coordinate conversions ────────────────────────────────────

/** Top-left pixel of tile at grid position */
export function gridToPixel(pos: GridPos, layout: LayoutMetrics): { x: number; y: number } {
  const { tileSize, tilePad, boardX, boardY } = layout;
  const rowWidth = ROW_WIDTHS[pos.row];
  const row0Width = 7 * tileSize + 6 * tilePad;
  const thisRowWidth = rowWidth * tileSize + (rowWidth - 1) * tilePad;
  const rowOffsetX = (row0Width - thisRowWidth) / 2;

  const x = boardX + rowOffsetX + pos.col * (tileSize + tilePad);
  const y = boardY + pos.row * (tileSize + tilePad);
  return { x, y };
}

/** Find grid position from pixel coordinates, or null if outside */
export function pixelToGrid(px: number, py: number, layout: LayoutMetrics): GridPos | null {
  const { tileSize, tilePad, boardX, boardY } = layout;
  const row0Width = 7 * tileSize + 6 * tilePad;

  for (let row = 0; row < NUM_ROWS; row++) {
    const rowWidth = ROW_WIDTHS[row];
    const thisRowWidth = rowWidth * tileSize + (rowWidth - 1) * tilePad;
    const rowOffsetX = (row0Width - thisRowWidth) / 2;
    const rowX = boardX + rowOffsetX;
    const rowY = boardY + row * (tileSize + tilePad);

    if (py >= rowY && py < rowY + tileSize) {
      if (px >= rowX && px < rowX + thisRowWidth) {
        const col = Math.floor((px - rowX) / (tileSize + tilePad));
        // Verify we're actually on the tile, not in the gap
        const tileX = rowX + col * (tileSize + tilePad);
        if (px >= tileX && px < tileX + tileSize && col < rowWidth) {
          return { row, col };
        }
      }
    }
  }
  return null;
}

/** Get possible fall targets for a tile at (row, col) */
export function fallTargets(pos: GridPos): GridPos[] {
  if (pos.row >= NUM_ROWS - 1) return [];
  const nextRowWidth = ROW_WIDTHS[pos.row + 1];
  const targets: GridPos[] = [];

  // Down-left: same col index maps to col-1 in next row (since next row is narrower and offset)
  // Actually: in our inverted pyramid, row r has width w, row r+1 has width w-1.
  // Tile (r,c) sits above (r+1, c-1) and (r+1, c) in the narrower row.
  // Down-left = (r+1, c-1), Down-right = (r+1, c)
  // But c-1 must be >= 0, and c must be < nextRowWidth

  const downLeft = pos.col - 1;
  const downRight = pos.col;

  // Prefer down-left first
  if (downLeft >= 0 && downLeft < nextRowWidth) {
    targets.push({ row: pos.row + 1, col: downLeft });
  }
  if (downRight >= 0 && downRight < nextRowWidth) {
    targets.push({ row: pos.row + 1, col: downRight });
  }

  return targets;
}

// ── PRNG (xoshiro128**) ───────────────────────────────────────

export class PRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    // splitmix32 to initialize state
    this.s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      seed += 0x9e3779b9;
      let t = seed;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      this.s[i] = (t ^ (t >>> 15)) >>> 0;
    }
  }

  next(): number {
    const s = this.s;
    const result = Math.imul(s[1] * 5, 1 << 7 | 1) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11 | s[3] >>> 21) >>> 0;

    return result / 0x100000000; // [0, 1)
  }

  /** Random integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Pick a weighted random letter from the frequency distribution */
  nextLetter(): string {
    const r = this.next();
    for (const [letter, cumProb] of LETTER_CDF) {
      if (r < cumProb) return letter;
    }
    return 'E'; // fallback
  }
}
