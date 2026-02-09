import { type Tile, type GridPos, type LayoutMetrics, pixelToGrid, gridToPixel, ROW_WIDTHS, NUM_ROWS } from './types';
import { Board } from './board';

export interface DragState {
  tile: Tile;
  originPos: GridPos;
  offsetX: number;
  offsetY: number;
}

export class Input {
  private canvas: HTMLCanvasElement;
  private layout!: LayoutMetrics;
  private board!: Board;
  private drag: DragState | null = null;
  private dropTarget: GridPos | null = null;
  private enabled: boolean = true;

  /** Called when a tile is dropped at a new valid position */
  onDrop: ((tile: Tile, from: GridPos, to: GridPos) => void) | null = null;
  /** Called on any tap (for start screen etc) */
  onTap: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
  }

  setLayout(layout: LayoutMetrics): void {
    this.layout = layout;
  }

  setBoard(board: Board): void {
    this.board = board;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getDrag(): DragState | null {
    return this.drag;
  }

  getDropTarget(): GridPos | null {
    return this.dropTarget;
  }

  private getCanvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) {
      this.onTap?.();
      return;
    }

    const { x, y } = this.getCanvasCoords(e);
    const gridPos = pixelToGrid(x, y, this.layout);

    if (!gridPos) {
      this.onTap?.();
      return;
    }

    const tile = this.board.get(gridPos);
    if (!tile || !tile.settled) {
      this.onTap?.();
      return;
    }

    // Start dragging
    this.canvas.setPointerCapture(e.pointerId);
    const tilePixel = gridToPixel(gridPos, this.layout);
    this.drag = {
      tile,
      originPos: { ...gridPos },
      offsetX: x - tilePixel.x,
      offsetY: y - tilePixel.y,
    };

    // Remove from board during drag
    this.board.remove(tile);
    tile.settled = false;

    // Update visual position to follow pointer
    tile.visualX = x - this.drag.offsetX;
    tile.visualY = y - this.drag.offsetY;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag) return;

    const { x, y } = this.getCanvasCoords(e);
    this.drag.tile.visualX = x - this.drag.offsetX;
    this.drag.tile.visualY = y - this.drag.offsetY;

    // Find nearest empty grid position for drop target
    this.dropTarget = this.findNearestEmpty(x, y);
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.drag) return;

    const tile = this.drag.tile;
    const origin = this.drag.originPos;

    if (this.dropTarget && !this.posEqual(this.dropTarget, origin)) {
      // Valid drop at new position
      this.board.place(tile, this.dropTarget);
      tile.settled = false; // will fall from here
      this.onDrop?.(tile, origin, this.dropTarget);
    } else {
      // Return to original position
      this.board.place(tile, origin);
      tile.settled = true;
      const px = gridToPixel(origin, this.layout);
      tile.visualX = px.x;
      tile.visualY = px.y;
    }

    this.drag = null;
    this.dropTarget = null;
  }

  private findNearestEmpty(px: number, py: number): GridPos | null {
    let best: GridPos | null = null;
    let bestDist = Infinity;

    for (let r = 0; r < NUM_ROWS; r++) {
      for (let c = 0; c < ROW_WIDTHS[r]; c++) {
        const pos = { row: r, col: c };
        if (!this.board.isEmpty(pos)) continue;

        const gp = gridToPixel(pos, this.layout);
        const cx = gp.x + this.layout.tileSize / 2;
        const cy = gp.y + this.layout.tileSize / 2;
        const dist = Math.hypot(px - cx, py - cy);

        if (dist < bestDist && dist < this.layout.tileSize * 1.5) {
          bestDist = dist;
          best = pos;
        }
      }
    }

    return best;
  }

  private posEqual(a: GridPos, b: GridPos): boolean {
    return a.row === b.row && a.col === b.col;
  }
}
