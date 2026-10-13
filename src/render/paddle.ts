import { COLORS, CONFIG } from "../config";
import type { Paddle } from "../game/physics";
import type { Projection } from "./projection";
import { roundRect } from "./sketch";

export interface PaddleStyle {
  face: string;
  faceDark: string;
  hand: boolean;
  artScale: number;
}

export const PLAYER_STYLE: PaddleStyle = { face: COLORS.paddleRed, faceDark: COLORS.paddleRedDark, hand: true, artScale: 1 };
export const AI_STYLE: PaddleStyle = { face: COLORS.paddleBlue, faceDark: "#2F5F9A", hand: false, artScale: CONFIG.aiPaddleArtScale };

/** Screen-space info for hit testing and tooltips. */
export interface PaddleScreen {
  x: number;
  y: number;
  r: number;
}

export function paddleScreen(P: Projection, p: Paddle, style: PaddleStyle): PaddleScreen {
  const c = P.project(p.pos.x, p.pos.y, p.pos.z);
  return { x: c.x, y: c.y, r: CONFIG.paddleArtR * c.scale * style.artScale };
}

export function drawPaddleShadow(ctx: CanvasRenderingContext2D, P: Projection, p: Paddle, style: PaddleStyle) {
  const g = P.project(p.pos.x, 0, p.pos.z);
  const R = CONFIG.paddleArtR * g.scale * style.artScale;
  const height = p.pos.y;
  const alpha = Math.max(0.15, 0.5 - height * 0.9);
  ctx.save();
  ctx.fillStyle = COLORS.shadow;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(g.x - R * 0.2 - p.tilt * R * 0.6, g.y + R * 0.05, R * 1.05, R * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPaddle(ctx: CanvasRenderingContext2D, P: Projection, p: Paddle, style: PaddleStyle) {
  const c = P.project(p.pos.x, p.pos.y, p.pos.z);
  const R = CONFIG.paddleArtR * c.scale * style.artScale;
  const lw = Math.max(2.2, R * 0.085);

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(p.tilt);
  const sq = p.squash;
  ctx.scale(1 + 0.1 * sq, 1 - 0.08 * sq);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = lw;

  // Handle.
  const hw = R * 0.48;
  const hTop = R * 0.8;
  const hLen = R * 1.25;
  ctx.fillStyle = COLORS.white;
  ctx.beginPath();
  roundRect(ctx, -hw / 2, hTop, hw, hLen, hw * 0.45);
  ctx.fill();
  ctx.stroke();

  // Handle inner shading line.
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  ctx.moveTo(hw * 0.18, hTop + R * 0.25);
  ctx.lineTo(hw * 0.18, hTop + hLen - R * 0.2);
  ctx.stroke();

  // Face.
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = lw;
  ctx.fillStyle = style.face;
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 1.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Lower-right shade on the face.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, R - lw / 2, R * 1.06 - lw / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = style.faceDark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(R * 0.25, R * 0.3, R * 1.1, R * 1.1, 0, 0, Math.PI * 2);
  ctx.rect(-R * 2, -R * 2, R * 4, R * 4);
  ctx.fill("evenodd");
  ctx.restore();

  // Highlight arc, upper-left.
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = Math.max(1.5, R * 0.11);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.7, Math.PI * 1.1, Math.PI * 1.42);
  ctx.stroke();

  // Grip hand icon.
  if (style.hand && R > 18) drawHand(ctx, 0, R * 0.08, R * 0.26);

  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineCap = "round";
  // Palm.
  ctx.beginPath();
  ctx.ellipse(0, size * 0.25, size * 0.5, size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fingers.
  ctx.lineWidth = size * 0.26;
  const fingers = [
    { x: -0.42, len: 0.65 },
    { x: -0.14, len: 0.85 },
    { x: 0.14, len: 0.8 },
    { x: 0.42, len: 0.6 },
  ];
  ctx.beginPath();
  for (const f of fingers) {
    ctx.moveTo(f.x * size, 0);
    ctx.lineTo(f.x * size, -f.len * size);
  }
  // Thumb.
  ctx.moveTo(-size * 0.45, size * 0.4);
  ctx.lineTo(-size * 0.9, size * 0.05);
  ctx.stroke();
  ctx.restore();
}
