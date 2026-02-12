import {
  type LayoutMetrics, type Tile, type GridPos,
  ROW_WIDTHS, NUM_ROWS,
  gridToPixel, SCRABBLE_VALUES, SPAWN_SCALE_MS,
} from './types';

// ── Colors ────────────────────────────────────────────────────

const BOARD_BG     = '#2c5f2d';
const SLOT_BG      = '#1e4620';
const HAND_SLOT_BG = '#244f26';
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
    const { tileSize, tilePad } = this.layout;
    const r = tileSize * 0.08;

    for (let row = 0; row < NUM_ROWS; row++) {
      // Hand row (row 0) gets a slightly lighter slot shade
      const isHand = row === 0;
      for (let col = 0; col < ROW_WIDTHS[row]; col++) {
        const { x, y } = gridToPixel({ row, col }, this.layout);
        this.ctx.fillStyle = isHand ? HAND_SLOT_BG : SLOT_BG;
        this.ctx.strokeStyle = SLOT_BORDER;
        this.ctx.lineWidth = 1;
        this.roundRect(x, y, tileSize, tileSize, r);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

    // Hand separator: dashed line between row 0 and row 1
    const row0Start = gridToPixel({ row: 0, col: 0 }, this.layout);
    const row0End = gridToPixel({ row: 0, col: ROW_WIDTHS[0] - 1 }, this.layout);
    const sepY = row0Start.y + tileSize + tilePad * 0.45;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([tileSize * 0.15, tileSize * 0.1]);
    this.ctx.beginPath();
    this.ctx.moveTo(row0Start.x, sepY);
    this.ctx.lineTo(row0End.x + tileSize, sepY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  drawTile(tile: Tile, alpha: number = 1, now: number = performance.now()): void {
    const { tileSize } = this.layout;
    const x = tile.visualX;
    const y = tile.visualY;
    const s = tileSize;
    const r = s * 0.08;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Spawn scale-in animation for hand tiles
    if (tile.spawnedAt !== undefined) {
      const elapsed = now - tile.spawnedAt;
      if (elapsed < SPAWN_SCALE_MS) {
        const t = elapsed / SPAWN_SCALE_MS;
        // Ease-out cubic
        const scale = 1 - (1 - t) * (1 - t) * (1 - t);
        const cx = x + s / 2;
        const cy = y + s / 2;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
      } else {
        tile.spawnedAt = undefined; // animation done
      }
    }

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

  drawTiles(tiles: Tile[], now: number = performance.now()): void {
    for (const tile of tiles) {
      this.drawTile(tile, 1, now);
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

  /** Draw the word text overlaid on a row during clearing phase */
  drawWordOverlay(row: number, word: string, valid: boolean, progress: number): void {
    const { tileSize } = this.layout;
    const ctx = this.ctx;
    const width = ROW_WIDTHS[row];
    const startPos = gridToPixel({ row, col: 0 }, this.layout);
    const endPos = gridToPixel({ row, col: width - 1 }, this.layout);
    const centerX = (startPos.x + endPos.x + tileSize) / 2;
    const centerY = startPos.y + tileSize / 2;

    ctx.save();

    if (valid) {
      // Gold text with pulsing glow
      const pulse = 0.6 + 0.4 * Math.sin(progress * Math.PI * 4);
      const glowRadius = tileSize * 0.3 * pulse;

      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = glowRadius;
      ctx.fillStyle = '#ffdd44';
    } else {
      // Dim red, no glow
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#cc4444';
    }

    const fontSize = Math.min(tileSize * 0.45, 24);
    ctx.font = `bold ${fontSize}px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, centerX, centerY);

    ctx.restore();
  }

  /** White flash overlay for perfect board celebration */
  drawPerfectFlash(progress: number): void {
    if (progress >= 1) return;
    const ctx = this.ctx;
    const { canvasW, canvasH } = this.layout;

    // Quick flash in, slow fade out
    const alpha = progress < 0.15
      ? progress / 0.15 * 0.6
      : 0.6 * (1 - (progress - 0.15) / 0.85);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  /** Floating "PERFECT BOARD!" text */
  drawPerfectText(progress: number): void {
    const ctx = this.ctx;
    const { canvasW, canvasH } = this.layout;

    const alpha = progress < 0.1
      ? progress / 0.1
      : progress > 0.8
        ? (1 - progress) / 0.2
        : 1;

    const scale = 0.8 + 0.2 * Math.sin(progress * Math.PI * 3);
    const y = canvasH * 0.38 - 20 * progress;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ffdd44';
    ctx.font = `bold ${32 * scale}px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 12;
    ctx.fillText('PERFECT BOARD!', canvasW / 2, y);
    ctx.restore();
  }

  highlightDropTarget(pos: GridPos): void {
    const { tileSize } = this.layout;
    const { x, y } = gridToPixel(pos, this.layout);
    const r = tileSize * 0.08;
    this.ctx.fillStyle = DROP_TARGET_COLOR;
    this.roundRect(x, y, tileSize, tileSize, r);
    this.ctx.fill();
  }

  drawHUD(score: number, timeLeft: number, _phase: string, highScore: number = 0, muted: boolean = false): void {
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

    // High score - right (shifted left to make room for mute icon)
    if (highScore > 0) {
      const smallFont = Math.max(fontSize * 0.7, 11);
      ctx.font = `${smallFont}px "Georgia", serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a0c8a0';
      ctx.fillText(`Best: ${highScore}`, canvasW - 30, midY);
    }

    // Mute icon - top-right corner
    this.drawMuteIcon(canvasW - 16, midY, Math.max(boardY * 0.25, 8), muted);
  }

  /** Draw a speaker icon; returns nothing (hit test is in Game) */
  private drawMuteIcon(cx: number, cy: number, size: number, muted: boolean): void {
    const ctx = this.ctx;
    const s = size;

    ctx.save();
    ctx.fillStyle = muted ? '#886666' : HUD_TEXT;
    ctx.strokeStyle = muted ? '#886666' : HUD_TEXT;
    ctx.lineWidth = Math.max(1, s * 0.12);

    // Speaker body (small rectangle + triangle)
    ctx.beginPath();
    // Rectangle part
    ctx.rect(cx - s * 0.5, cy - s * 0.25, s * 0.3, s * 0.5);
    ctx.fill();
    // Triangle cone
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.25);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.55);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.55);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.25);
    ctx.closePath();
    ctx.fill();

    if (muted) {
      // X through speaker
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.35, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.75, cy + s * 0.3);
      ctx.moveTo(cx + s * 0.75, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.35, cy + s * 0.3);
      ctx.stroke();
    } else {
      // Sound waves (two arcs)
      ctx.beginPath();
      ctx.arc(cx + s * 0.2, cy, s * 0.35, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.2, cy, s * 0.6, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Get the mute button hit area for click detection */
  getMuteHitArea(): { x: number; y: number; w: number; h: number } {
    const { canvasW, boardY } = this.layout;
    const size = Math.max(boardY * 0.25, 8);
    const cx = canvasW - 16;
    const cy = boardY * 0.5;
    // Generous hit area
    return { x: cx - size, y: cy - size, w: size * 2.5, h: size * 2 };
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

  drawStartScreen(muted: boolean = false, highScore: number = 0): void {
    const ctx = this.ctx;
    const { canvasW, canvasH, boardY, tileSize } = this.layout;

    this.clear();
    this.drawSlots();

    // Draw CASCADE as Scrabble tiles
    const letters = ['C', 'A', 'S', 'C', 'A', 'D', 'E'];
    const titleTileSize = Math.min(tileSize * 1.15, canvasW / 8.5);
    const titlePad = titleTileSize * 0.08;
    const totalW = letters.length * titleTileSize + (letters.length - 1) * titlePad;
    const startX = (canvasW - totalW) / 2;
    const titleY = canvasH / 2 - titleTileSize * 0.7;

    for (let i = 0; i < letters.length; i++) {
      const fakeTile: Tile = {
        id: -1, letter: letters[i],
        pos: { row: 0, col: 0 }, settled: true,
        visualX: startX + i * (titleTileSize + titlePad),
        visualY: titleY,
      };
      // Temporarily override tileSize for larger title tiles
      const savedSize = this.layout.tileSize;
      this.layout.tileSize = titleTileSize;
      this.drawTile(fakeTile);
      this.layout.tileSize = savedSize;
    }

    ctx.fillStyle = HUD_TEXT;
    ctx.font = `20px "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tap to Start', canvasW / 2, titleY + titleTileSize + 30);

    // Show high score if exists
    if (highScore > 0) {
      ctx.fillStyle = '#a0c8a0';
      ctx.font = `16px "Georgia", serif`;
      ctx.fillText(`Best: ${highScore}`, canvasW / 2, titleY + titleTileSize + 58);
    }

    // Mute icon on start screen too
    this.drawMuteIcon(canvasW - 16, boardY * 0.5, Math.max(boardY * 0.25, 8), muted);
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
