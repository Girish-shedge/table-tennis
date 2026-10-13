import { COLORS, CONFIG, FONTS } from "../config";
import type { Layout } from "./projection";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function mix(c1: string, c2: string, k: number): string {
  const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = h(c1);
  const b = h(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
}

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
    this.drawNumeral(ctx, p, px, y, size, this.popPlayerAt, COLORS.paddleRed, now);
    this.drawNumeral(ctx, a, ax, y, size, this.popAiAt, COLORS.paddleBlue, now);

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

  private numeralFont(size: number) {
    return `700 ${size}px ${FONTS.serif}`;
  }

  /** Numeral that scales in, tints to the scorer's colour, and spawns a rising white "+1". */
  private drawNumeral(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    at: number,
    accent: string,
    now: number,
  ) {
    const t = (now - at) / 1000; // seconds since this player scored
    const active = t >= 0 && t < 1;
    const pop = t >= 0 && t < 0.5 ? 1 + Math.sin((t / 0.5) * Math.PI) * 0.32 : 1;
    const tint = active ? (t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45) : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.font = this.numeralFont(size);
    ctx.fillStyle = tint > 0 ? mix(COLORS.ink, accent, tint) : COLORS.ink;
    ctx.fillText(text, 0, 0);
    ctx.restore();

    if (active) {
      const rise = easeOut(t) * size * 0.55;
      ctx.save();
      ctx.globalAlpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
      ctx.font = `700 ${Math.round(size * 0.6)}px ${FONTS.serif}`;
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, size * 0.07);
      ctx.strokeStyle = COLORS.ink;
      ctx.fillStyle = COLORS.white;
      ctx.strokeText("+1", x, y - size * 0.18 - rise);
      ctx.fillText("+1", x, y - size * 0.18 - rise);
      ctx.restore();
    }
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
      ctx.font = `700 ${Math.round(20 * s)}px ${FONTS.serif}`;
      ctx.fillStyle = COLORS.bubble;
      ctx.fillText(this.flashText, x, L.captionY);
    } else {
      ctx.font = `${Math.round(19 * s)}px ${FONTS.sans}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(text, x, L.captionY);
    }
    ctx.restore();
  }
}
