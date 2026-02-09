import {
  type Tile, type GridPos,
  ROW_WIDTHS, NUM_ROWS, TOTAL_POSITIONS,
  SCRABBLE_VALUES, LENGTH_MULTIPLIERS,
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
   * Check if a tile is covered by tiles in the row above.
   * Tile at (r, c) is covered if (r-1, c) or (r-1, c+1) has a tile.
   * Hand tiles (row 0) are never covered.
   */
  isCovered(pos: GridPos): boolean {
    if (pos.row === 0) return false;
    const aboveRow = pos.row - 1;
    const aboveWidth = ROW_WIDTHS[aboveRow];
    if (pos.col < aboveWidth && this.grid[aboveRow][pos.col] !== null) return true;
    if (pos.col + 1 < aboveWidth && this.grid[aboveRow][pos.col + 1] !== null) return true;
    return false;
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
