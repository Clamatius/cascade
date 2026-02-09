import {
  type Tile, type GridPos,
  ROW_WIDTHS, NUM_ROWS, TOTAL_POSITIONS,
  fallTargets, SCRABBLE_VALUES, LENGTH_MULTIPLIERS,
} from './types';

export class Board {
  /** grid[row][col] = Tile | null */
  grid: (Tile | null)[][];

  constructor() {
    this.grid = [];
    for (let r = 0; r < NUM_ROWS; r++) {
      this.grid.push(new Array(ROW_WIDTHS[r]).fill(null));
    }
  }

  get(pos: GridPos): Tile | null {
    return this.grid[pos.row]?.[pos.col] ?? null;
  }

  set(pos: GridPos, tile: Tile | null): void {
    this.grid[pos.row][pos.col] = tile;
  }

  isEmpty(pos: GridPos): boolean {
    return this.get(pos) === null;
  }

  /** Place a tile, updating its pos */
  place(tile: Tile, pos: GridPos): void {
    tile.pos = { ...pos };
    this.set(pos, tile);
  }

  /** Remove tile from its current position */
  remove(tile: Tile): void {
    this.set(tile.pos, null);
  }

  /** Count filled positions */
  filledCount(): number {
    let count = 0;
    for (let r = 0; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        if (this.grid[r][c] !== null) count++;
      }
    }
    return count;
  }

  isFull(): boolean {
    return this.filledCount() === TOTAL_POSITIONS;
  }

  /** Get empty positions in a specific row */
  emptyInRow(row: number): number[] {
    const empty: number[] = [];
    for (let c = 0; c < ROW_WIDTHS[row]; c++) {
      if (this.grid[row][c] === null) empty.push(c);
    }
    return empty;
  }

  /**
   * Apply gravity one step. Process bottom-to-top.
   * Returns true if any tile moved (meaning more gravity steps needed).
   */
  applyGravity(): boolean {
    let anyMoved = false;

    // Bottom-to-top, skip last row (can't fall further)
    for (let r = NUM_ROWS - 2; r >= 0; r--) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const tile = this.grid[r][c];
        if (!tile) continue;

        const targets = fallTargets(tile.pos);
        let moved = false;

        for (const target of targets) {
          if (this.isEmpty(target)) {
            this.set(tile.pos, null);
            tile.pos = { ...target };
            tile.settled = false;
            this.set(target, tile);
            moved = true;
            anyMoved = true;
            break;
          }
        }

        if (!moved && !tile.settled) {
          // Check if tile truly can't fall (all targets occupied or at bottom)
          const canFall = targets.some(t => this.isEmpty(t));
          if (!canFall) {
            tile.settled = true;
          }
        }
      }
    }

    // Bottom row tiles are always settled if present
    for (let c = 0; c < ROW_WIDTHS[NUM_ROWS - 1]; c++) {
      const tile = this.grid[NUM_ROWS - 1][c];
      if (tile) tile.settled = true;
    }

    return anyMoved;
  }

  /** Read a row left-to-right as a word string */
  readRow(row: number): string {
    let word = '';
    for (let c = 0; c < ROW_WIDTHS[row]; c++) {
      const tile = this.grid[row][c];
      if (!tile) return ''; // incomplete row
      word += tile.letter;
    }
    return word.toUpperCase();
  }

  /** Check if a specific row is completely filled */
  isRowFull(row: number): boolean {
    for (let c = 0; c < ROW_WIDTHS[row]; c++) {
      if (this.grid[row][c] === null) return false;
    }
    return true;
  }

  /** Score a word: sum of scrabble values × length multiplier */
  static scoreWord(word: string): number {
    let sum = 0;
    for (const ch of word) {
      sum += SCRABBLE_VALUES[ch] ?? 0;
    }
    const mult = LENGTH_MULTIPLIERS[word.length] ?? 1;
    return Math.round(sum * mult);
  }

  /** Get all tiles as a flat array */
  allTiles(): Tile[] {
    const tiles: Tile[] = [];
    for (let r = 0; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const t = this.grid[r][c];
        if (t) tiles.push(t);
      }
    }
    return tiles;
  }

  /** Clear entire board */
  clearAll(): void {
    for (let r = 0; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        this.grid[r][c] = null;
      }
    }
  }
}
