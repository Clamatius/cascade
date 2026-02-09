import {
  type LayoutMetrics, type Tile, type GridPos,
  ROW_WIDTHS, NUM_ROWS,
  gridToPixel, SCRABBLE_VALUES,
} from './types';

// ── Colors ────────────────────────────────────────────────────

const BOARD_BG     = '#2c5f2d';
const SLOT_BG      = '#1e4620';
const SLOT_BORDER  = '#173518';
const TILE_FACE    = '#f5e6c8';
const TILE_LIGHT   = '#faf3e3';
const TILE_SHADOW  = '#c4a882';
const TILE_BORDER  = '#b8996b';
const TILE_LETTER  = '#333333';
const TILE_POINTS  = '#666666';
const HUD_TEXT     = '#e8e0d0';

const HIGHLIGHT_VALID   = 'rgba(100, 220, 100, 0.4)';
const HIGHLIGHT_INVALID = 'rgba(220, 80, 80, 0.35)';
const DROP_TARGET_COLOR = 'rgba(255, 255, 200, 0.3)';

// ── Renderer ──────────────────────────────────────────────────

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private layout!: LayoutMetrics;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  setLayout(layout: LayoutMetrics): void {
    this.layout = layout;
  }

  clear(): void {
    this.ctx.fillStyle = BOARD_BG;
    this.ctx.fillRect(0, 0, this.layout.canvasW, this.layout.canvasH);
  }

  drawSlots(): void {
    const { tileSize } = this.layout;
    const r = tileSize * 0.08;

    for (let row = 0; row < NUM_ROWS; row++) {
      for (let col = 0; col < ROW_WIDTHS[row]; col++) {
        const { x, y } = gridToPixel({ row, col }, this.layout);
        this.ctx.fillStyle = SLOT_BG;
        this.ctx.strokeStyle = SLOT_BORDER;
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, tileSize, tileSize, r);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }
  }

  drawTile(tile: Tile, alpha: number = 1): void {
    const { tileSize } = this.layout;
    const x = tile.visualX;
    const y = tile.visualY;
    const s = tileSize;
    const r = s * 0.08;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    ctx.fillStyle = TILE_SHADOW;
    this.roundRect(x + 1, y + 2, s, s, r);
    ctx.fill();

    // Main face
    ctx.fillStyle = TILE_FACE;
    this.roundRect(x, y, s, s, r);
    ctx.fill();

    // Top-left highlight
    ctx.fillStyle = TILE_LIGHT;
    this.roundRect(x, y, s * 0.96, s * 0.5, r);
    ctx.fill();

    // Re-draw main face slightly smaller for blend
    ctx.fillStyle = TILE_FACE;
    this.roundRect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92, r * 0.8);
    ctx.fill();

    // Border
    ctx.strokeStyle = TILE_BORDER;
    ctx.lineWidth = 1;
    this.roundRect(x, y, s, s, r);
    ctx.stroke();

    // Letter
    const isQu = tile.letter === 'Qu';
    const letterFontSize = isQu ? s * 0.42 : s * 0.52;
    ctx.fillStyle = TILE_LETTER;
    ctx.font = `bold ${letterFontSize}px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letterY = y + s * 0.46;
    ctx.fillText(tile.letter, x + s / 2, letterY);

    // Points value (bottom-right)
    const points = tile.letter === 'Qu'
      ? SCRABBLE_VALUES['Q']! + SCRABBLE_VALUES['U']!
      : SCRABBLE_VALUES[tile.letter]!;
    const ptFontSize = s * 0.2;
    ctx.fillStyle = TILE_POINTS;
    ctx.font = `${ptFontSize}px "Georgia", serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(points), x + s - s * 0.08, y + s - s * 0.05);

    ctx.restore();
  }

  drawTiles(tiles: Tile[]): void {
    for (const tile of tiles) {
      this.drawTile(tile);
    }
  }

  highlightRow(row: number, valid: boolean): void {
    const { tileSize } = this.layout;
    const width = ROW_WIDTHS[row];
    const startPos = gridToPixel({ row, col: 0 }, this.layout);
    const endPos = gridToPixel({ row, col: width - 1 }, this.layout);
    const pad = tileSize * 0.05;

    this.ctx.fillStyle = valid ? HIGHLIGHT_VALID : HIGHLIGHT_INVALID;
    this.roundRect(
      startPos.x - pad,
      startPos.y - pad,
      (endPos.x + tileSize) - startPos.x + pad * 2,
      tileSize + pad * 2,
      tileSize * 0.08
    );
    this.ctx.fill();
  }

  highlightDropTarget(pos: GridPos): void {
    const { tileSize } = this.layout;
    const { x, y } = gridToPixel(pos, this.layout);
    const r = tileSize * 0.08;
    this.ctx.fillStyle = DROP_TARGET_COLOR;
    this.roundRect(x, y, tileSize, tileSize, r);
    this.ctx.fill();
  }

  drawHUD(score: number, timeLeft: number, _phase: string, highScore: number = 0): void {
    const ctx = this.ctx;
    const { canvasW, boardY } = this.layout;
    const fontSize = Math.max(boardY * 0.35, 14);
    const midY = boardY * 0.5;

    ctx.fillStyle = HUD_TEXT;

    // Timer - left
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    ctx.font = `bold ${fontSize}px "Georgia", serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, 10, midY);

    // Score - center
    ctx.textAlign = 'center';
    ctx.fillText(String(score), canvasW / 2, midY);

    // High score - right
    if (highScore > 0) {
      const smallFont = Math.max(fontSize * 0.7, 11);
      ctx.font = `${smallFont}px "Georgia", serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a0c8a0';
      ctx.fillText(`Best: ${highScore}`, canvasW - 10, midY);
    }
  }

  drawFloatingScore(x: number, y: number, text: string, progress: number): void {
    const ctx = this.ctx;
    const alpha = 1 - progress;
    const offsetY = -30 * progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffdd44';
    ctx.font = `bold 20px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + offsetY);
    ctx.restore();
  }

  drawStartScreen(): void {
    const ctx = this.ctx;
    const { canvasW, canvasH } = this.layout;

    this.clear();
    this.drawSlots();

    ctx.fillStyle = HUD_TEXT;
    ctx.font = `bold 36px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CASCADE', canvasW / 2, canvasH / 2 - 40);

    ctx.font = `20px "Georgia", serif`;
    ctx.fillText('Tap to Start', canvasW / 2, canvasH / 2 + 20);
  }

  drawRoundEnd(score: number, highScore: number, isNewHigh: boolean, topScores: number[]): void {
    const ctx = this.ctx;
    const { canvasW, canvasH } = this.layout;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    let y = canvasH * 0.2;

    ctx.fillStyle = HUD_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold 32px "Georgia", serif`;
    ctx.fillText('Round Over', cx, y);
    y += 50;

    ctx.font = `bold 48px "Georgia", serif`;
    ctx.fillText(String(score), cx, y);
    y += 36;

    if (isNewHigh) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = `bold 20px "Georgia", serif`;
      ctx.fillText('New High Score!', cx, y);
      ctx.fillStyle = HUD_TEXT;
    }
    y += 40;

    // High scores table
    if (topScores.length > 0) {
      ctx.font = `bold 18px "Georgia", serif`;
      ctx.fillStyle = '#a0c8a0';
      ctx.fillText('High Scores', cx, y);
      y += 28;

      ctx.font = `18px "Georgia", serif`;
      for (let i = 0; i < topScores.length; i++) {
        const isCurrent = topScores[i] === highScore && isNewHigh && topScores.indexOf(highScore) === i;
        ctx.fillStyle = isCurrent ? '#ffdd44' : HUD_TEXT;
        ctx.fillText(`${i + 1}.  ${topScores[i]}`, cx, y);
        y += 24;
      }
    }

    y = canvasH * 0.85;
    ctx.fillStyle = HUD_TEXT;
    ctx.font = `20px "Georgia", serif`;
    ctx.fillText('Tap to Play Again', cx, y);
  }

  // ── Helpers ───────────────────────────────────────────────

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
