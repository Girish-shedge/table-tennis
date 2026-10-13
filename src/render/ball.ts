import { COLORS, CONFIG } from "../config";
import type { Ball } from "../game/physics";
import type { Projection } from "./projection";

const ART_R = 0.026;

export function ballRadiusPx(P: Projection, z: number): number {
  return Math.max(3.5, ART_R * P.scaleAt(z));
}

/** Is the ball over the table's footprint (so the table can occlude or shade it)? */
export function overTable(b: Ball): boolean {
  return Math.abs(b.pos.x) <= CONFIG.tableW / 2 && b.pos.z >= 0 && b.pos.z <= CONFIG.tableL;
}

/** A ball that has dropped below the table top while still under the table is hidden by it. */
export function hiddenByTable(b: Ball): boolean {
  return overTable(b) && b.pos.y < -0.02;
}

export function drawBallShadow(ctx: CanvasRenderingContext2D, P: Projection, b: Ball) {
  if (!b.visible || hiddenByTable(b)) return;
  const onTable = overTable(b);
  // Shadow lands on the table when above it, otherwise on the ground far below.
  const groundY = onTable ? 0 : CONFIG.floorY;
  const g = P.project(b.pos.x, groundY, b.pos.z);
  const r = ballRadiusPx(P, b.pos.z);
  const h = Math.max(0, b.pos.y - groundY);
  const spread = 1 + h * 1.6;
  ctx.save();
  if (onTable) {
    ctx.globalAlpha = Math.max(0.08, 0.45 - h * 0.45);
    ctx.fillStyle = COLORS.shadow;
  } else {
    ctx.globalAlpha = Math.max(0.1, 0.32 - h * 0.15);
    ctx.fillStyle = "#6b7280";
  }
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, r * spread, r * 0.5 * spread, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBall(ctx: CanvasRenderingContext2D, P: Projection, b: Ball, reducedMotion: boolean) {
  if (!b.visible) return;
  const r = ballRadiusPx(P, b.pos.z);
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);

  // Motion blur: a tapered streak that follows the ball's recent path.
  if (!reducedMotion && speed > 1.2 && b.trail.length > 2) {
    const head = P.project(b.pos.x, b.pos.y, b.pos.z);
    const n = Math.min(b.trail.length, 24);
    let prev = head;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = COLORS.ink;
    for (let i = 1; i < n; i += 2) {
      const t = b.trail[i];
      const q = P.project(t.x, t.y, t.z);
      const k = 1 - i / n;
      ctx.globalAlpha = 0.38 * k;
      ctx.lineWidth = Math.max(1, r * 1.6 * k);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      prev = q;
    }
    ctx.restore();
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
