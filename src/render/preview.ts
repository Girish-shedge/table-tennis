import { COLORS, CONFIG } from "../config";
import type { Vec3 } from "../game/physics";
import type { Projection } from "./projection";

/**
 * Dotted flight of your serve and a ring where it will land. The ring turns red when the
 * power is in the "may go out" zone or the nominal landing is already off the table.
 */
export function drawServePreview(
  ctx: CanvasRenderingContext2D,
  P: Projection,
  path: { points: Vec3[]; landing: Vec3 },
  s: number,
  risky: boolean,
) {
  const { points, landing } = path;
  const offTable = Math.abs(landing.x) > CONFIG.tableW / 2 || landing.z > CONFIG.tableL || landing.y < 0;
  const warn = risky || offTable;

  ctx.save();
  // Dots get smaller and lighter with distance, like the ball does.
  for (let i = 1; i < points.length - 1; i += 1) {
    const q = points[i];
    const c = P.project(q.x, q.y, q.z);
    const r = Math.max(1.5, 0.012 * c.scale);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Landing ring, flat on the table.
  const g = P.project(landing.x, Math.max(landing.y, 0), landing.z);
  const rx = 0.07 * g.scale;
  const ry = rx * 0.42;
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(2, 2.5 * s);
  ctx.strokeStyle = warn ? COLORS.bubble : COLORS.white;
  ctx.fillStyle = warn ? "rgba(242, 59, 59, 0.25)" : "rgba(255, 255, 255, 0.35)";
  ctx.setLineDash([Math.max(3, 5 * s), Math.max(3, 4 * s)]);
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = warn ? COLORS.bubble : COLORS.white;
  ctx.fill();
  ctx.restore();
}
