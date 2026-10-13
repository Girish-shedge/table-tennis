import { COLORS, CONFIG, FONTS } from "../config";
import { easeOutBack, roundRect } from "./sketch";

/** Red speech bubble with white serif text that pops in and fades out. */
export class Bubble {
  private text = "";
  private shownAt = -1e9;

  show(text: string, now: number) {
    this.text = text;
    this.shownAt = now;
  }

  draw(ctx: CanvasRenderingContext2D, now: number, ax: number, ay: number, s: number) {
    const age = now - this.shownAt;
    const total = CONFIG.bubbleHoldMs + CONFIG.bubbleFadeMs;
    if (age < 0 || age > total) return;
    const popT = Math.min(1, age / 220);
    const scale = easeOutBack(popT);
    const alpha = age > CONFIG.bubbleHoldMs ? 1 - (age - CONFIG.bubbleHoldMs) / CONFIG.bubbleFadeMs : 1;

    const font = `${Math.round(15 * s)}px ${FONTS.serif}`;
    ctx.save();
    ctx.font = font;
    const padX = 9 * s;
    const padY = 5 * s;
    const tw = ctx.measureText(this.text).width;
    const w = tw + padX * 2;
    const h = 15 * s * 1.15 + padY * 2;

    ctx.globalAlpha = alpha;
    ctx.translate(ax, ay);
    ctx.scale(scale, scale);
    ctx.fillStyle = COLORS.bubble;
    ctx.beginPath();
    roundRect(ctx, 0, -h, w, h, 6 * s);
    ctx.fill();
    // Tail toward the head.
    ctx.beginPath();
    ctx.moveTo(4 * s, -2 * s);
    ctx.lineTo(-3 * s, 5 * s);
    ctx.lineTo(12 * s, -1 * s);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = COLORS.white;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(this.text, padX, -h / 2 + 0.5 * s);
    ctx.restore();
  }
}

/** The red `Grab` pill shown beside the player's paddle on hover / drag. */
export function drawGrabTooltip(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, label = "Grab") {
  ctx.save();
  const font = `${Math.round(13 * s)}px ${FONTS.serif}`;
  ctx.font = font;
  const padX = 8 * s;
  const w = ctx.measureText(label).width + padX * 2;
  const h = 22 * s;
  ctx.fillStyle = COLORS.bubble;
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  roundRect(ctx, x, y - h / 2, w, h, 6 * s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.white;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + padX, y + 0.5 * s);
  ctx.restore();
}
