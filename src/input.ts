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

  // Click vs drag detection
  private pointerStart: { x: number; y: number } | null = null;
  private isDragging = false;
  private readonly DRAG_THRESHOLD = 10; // CSS pixels

  /** Called when a hand tile (row 0) is tapped (not dragged) */
  onHandClick: ((pos: GridPos) => void) | null = null;
  /** Called when a tile is dragged and dropped to a new position */
  onDrop: ((tile: Tile, from: GridPos, to: GridPos) => void) | null = null;
  /** Called on any tap on empty space / non-interactive area */
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
    if (!tile) {
      this.onTap?.();
      return;
    }

    // Draggability check:
    // Hand tiles (row 0) are always interactive (click or drag)
    // Non-hand tiles must be settled and uncovered
    const isHand = gridPos.row === 0;
    if (!isHand) {
      if (!tile.settled || this.board.isCovered(gridPos)) {
        return; // can't interact with covered or falling tiles
      }
    }

    this.canvas.setPointerCapture(e.pointerId);
    this.pointerStart = { x, y };
    this.isDragging = false;

    // Prepare drag state but don't remove tile yet (wait for threshold)
    const tilePixel = gridToPixel(gridPos, this.layout);
    this.drag = {
      tile,
      originPos: { ...gridPos },
      offsetX: x - tilePixel.x,
      offsetY: y - tilePixel.y,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag || !this.pointerStart) return;

    const { x, y } = this.getCanvasCoords(e);

    if (!this.isDragging) {
      const dpr = window.devicePixelRatio || 1;
      const dx = x - this.pointerStart.x;
      const dy = y - this.pointerStart.y;
      if (Math.hypot(dx, dy) < this.DRAG_THRESHOLD * dpr) {
        return; // not yet a drag
      }
      // Crossed threshold - start actual drag
      this.isDragging = true;
      this.board.remove(this.drag.tile);
      this.drag.tile.settled = false;
    }

    this.drag.tile.visualX = x - this.drag.offsetX;
    this.drag.tile.visualY = y - this.drag.offsetY;
    this.dropTarget = this.findNearestEmpty(x, y);
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.drag) return;

    const tile = this.drag.tile;
    const origin = this.drag.originPos;

    if (!this.isDragging) {
      // It was a tap, not a drag
      this.drag = null;
      this.dropTarget = null;
      this.pointerStart = null;
  
      if (origin.row === 0) {
        // Tap on hand tile → drop it
        this.onHandClick?.(origin);
      }
      // Tap on non-hand tile does nothing
      return;
    }

    // It was a drag - tile is already removed from board
    if (this.dropTarget) {
      // Valid drop
      this.board.place(tile, this.dropTarget);
      tile.settled = false;
      this.onDrop?.(tile, origin, this.dropTarget);
    } else {
      // Invalid drop - return to origin if still empty
      if (this.board.isEmpty(origin)) {
        this.board.place(tile, origin);
        tile.settled = origin.row === 0; // hand tiles are settled, others will need gravity
        const px = gridToPixel(origin, this.layout);
        tile.visualX = px.x;
        tile.visualY = px.y;
      } else {
        // Origin now occupied (gravity filled it during drag) - find nearest empty
        const alt = this.findNearestEmpty(tile.visualX, tile.visualY);
        if (alt) {
          this.board.place(tile, alt);
          tile.settled = false;
          this.onDrop?.(tile, origin, alt);
        } else {
          // Nowhere to go - force back to origin (shouldn't happen in practice)
          this.board.set(origin, tile);
          tile.pos = { ...origin };
          tile.settled = true;
          const px = gridToPixel(origin, this.layout);
          tile.visualX = px.x;
          tile.visualY = px.y;
        }
      }
    }

    this.drag = null;
    this.dropTarget = null;
    this.pointerStart = null;
    this.isDragging = false;
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
}
