import { COLORS, CONFIG, FONTS } from "../config";
import type { Layout } from "./projection";

export class Hud {
  private popPlayerAt = -1e9;
  private popAiAt = -1e9;
  private flashText = "";
  private flashAt = -1e9;

  onScore(side: "player" | "ai", now: number) {
    if (side === "player") this.popPlayerAt = now;
    else this.popAiAt = now;
  }

  flash(text: string, now: number) {
    this.flashText = text;
    this.flashAt = now;
  }

  drawScore(ctx: CanvasRenderingContext2D, L: Layout, score: { player: number; ai: number }, now: number) {
    const s = L.box.s;
    const cx = L.box.x + L.box.w / 2;
    const y = L.scoreY;
    const size = Math.round((L.portrait ? 92 : 86) * s);
    const pad = 20 * s; // space between each numeral and the dot

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.muted;
    ctx.beginPath();
    ctx.arc(cx, y - size * 0.32, 3 * s, 0, Math.PI * 2);
    ctx.fill();

    const p = String(score.player);
    const a = String(score.ai);
    ctx.font = this.numeralFont(size);
    const px = cx - pad - Math.max(ctx.measureText(p).width, size * 0.5) / 2;
    const ax = cx + pad + Math.max(ctx.measureText(a).width, size * 0.5) / 2;
    this.drawNumeral(ctx, p, px, y, size, this.pop(now, this.popPlayerAt));
    this.drawNumeral(ctx, a, ax, y, size, this.pop(now, this.popAiAt));

    ctx.font = `700 ${Math.round(15 * s)}px ${FONTS.sans}`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(CONFIG.playerName, px, y + 22 * s);
    ctx.fillText(CONFIG.opponentName, ax, y + 22 * s);
    ctx.restore();
  }

  private flashAlpha(now: number): number {
    const age = now - this.flashAt;
    if (age < 0 || age >= 1400 || !this.flashText) return 0;
    return Math.max(0, age < 150 ? age / 150 : age > 1100 ? 1 - (age - 1100) / 300 : 1);
  }

  private pop(now: number, at: number): number {
    const t = (now - at) / 250;
    if (t < 0 || t > 1) return 1;
    return 1 + Math.sin(t * Math.PI) * 0.2;
  }

  private numeralFont(size: number) {
    return `700 ${size}px ${FONTS.serif}`;
  }

  private drawNumeral(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, scale: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.font = this.numeralFont(size);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /** Caption under the table; a point-reason flash temporarily replaces it. */
  drawCaption(ctx: CanvasRenderingContext2D, L: Layout, text: string, now: number) {
    const s = L.box.s;
    const x = L.box.x + L.box.w / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const a = this.flashAlpha(now);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.font = `italic ${Math.round(24 * s)}px ${FONTS.serif}`;
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(this.flashText, x, L.captionY);
    } else {
      ctx.font = `${Math.round(19 * s)}px ${FONTS.sans}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(text, x, L.captionY);
    }
    ctx.restore();
  }
}
