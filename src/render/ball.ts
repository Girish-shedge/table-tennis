import { COLORS, CONFIG } from "../config";
import type { Ball } from "../game/physics";
import type { Projection } from "./projection";

const ART_R = 0.026;

export function ballRadiusPx(P: Projection, z: number): number {
  return Math.max(3.5, ART_R * P.scaleAt(z));
}

export function drawBallShadow(ctx: CanvasRenderingContext2D, P: Projection, b: Ball) {
  if (!b.visible) return;
  const onTable = Math.abs(b.pos.x) <= CONFIG.tableW / 2 && b.pos.z >= 0 && b.pos.z <= CONFIG.tableL;
  if (!onTable || b.pos.y < -0.01) return;
  const g = P.project(b.pos.x, 0, b.pos.z);
  const r = ballRadiusPx(P, b.pos.z);
  const h = Math.max(0, b.pos.y);
  const spread = 1 + h * 1.6;
  const alpha = Math.max(0.08, 0.45 - h * 0.45);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, r * spread, r * 0.5 * spread, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBall(ctx: CanvasRenderingContext2D, P: Projection, b: Ball, reducedMotion: boolean) {
  if (!b.visible) return;
  const r = ballRadiusPx(P, b.pos.z);
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);

  // Motion trail.
  if (!reducedMotion && speed > 5 && b.trail.length > 3) {
    const alphas = [0.2, 0.12, 0.06];
    for (let i = 0; i < 3; i++) {
      const t = b.trail[(i + 1) * 2];
      if (!t) break;
      const q = P.project(t.x, t.y, t.z);
      ctx.save();
      ctx.globalAlpha = alphas[i];
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(q.x, q.y, ballRadiusPx(P, t.z) * (1 - i * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const c = P.project(b.pos.x, b.pos.y, b.pos.z);
  ctx.save();
  ctx.translate(c.x, c.y);
  const sq = b.squash;
  ctx.scale(1 + 0.3 * sq, 1 - 0.3 * sq);
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(1.4, r * 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
