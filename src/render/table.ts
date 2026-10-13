import { COLORS, CONFIG } from "../config";
import type { Projection } from "./projection";

export function drawTable(ctx: CanvasRenderingContext2D, P: Projection, s: number) {
  const hw = CONFIG.tableW / 2;
  const L = CONFIG.tableL;
  const nl = P.project(-hw, 0, 0);
  const nr = P.project(hw, 0, 0);
  const fl = P.project(-hw, 0, L);
  const fr = P.project(hw, 0, L);

  // Front edge thickness.
  const edge = 9 * s;
  ctx.fillStyle = COLORS.tableEdge;
  ctx.beginPath();
  ctx.moveTo(nl.x, nl.y);
  ctx.lineTo(nr.x, nr.y);
  ctx.lineTo(nr.x, nr.y + edge);
  ctx.lineTo(nl.x, nl.y + edge);
  ctx.closePath();
  ctx.fill();

  // Surface.
  ctx.fillStyle = COLORS.table;
  ctx.beginPath();
  ctx.moveTo(fl.x, fl.y);
  ctx.lineTo(fr.x, fr.y);
  ctx.lineTo(nr.x, nr.y);
  ctx.lineTo(nl.x, nl.y);
  ctx.closePath();
  ctx.fill();

  // White border, slightly inset.
  const inset = 0.035;
  const bl = P.project(-hw + inset, 0, inset);
  const br = P.project(hw - inset, 0, inset);
  const tl = P.project(-hw + inset, 0, L - inset * 0.6);
  const tr = P.project(hw - inset, 0, L - inset * 0.6);
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.stroke();

  // Center line.
  const cf = P.project(0, 0, L - inset * 0.6);
  const cn = P.project(0, 0, inset);
  ctx.lineWidth = Math.max(1.5, 2.2 * s);
  ctx.beginPath();
  ctx.moveTo(cf.x, cf.y);
  ctx.lineTo(cn.x, cn.y);
  ctx.stroke();
}

export function drawNet(ctx: CanvasRenderingContext2D, P: Projection, s: number, shimmer: number) {
  const hw = CONFIG.tableW / 2 + CONFIG.netOverhang;
  const base = P.project(0, 0, CONFIG.netZ);
  const top = P.project(0, CONFIG.netHeight, CONFIG.netZ);
  const left = P.project(-hw, 0, CONFIG.netZ).x;
  const right = P.project(hw, 0, CONFIG.netZ).x;
  const h = base.y - top.y;

  // Translucent band.
  ctx.fillStyle = COLORS.net;
  if (shimmer > 0) ctx.fillStyle = `rgba(190, 225, 255, ${0.6 + 0.3 * shimmer})`;
  ctx.fillRect(left, top.y, right - left, h);

  // Faint mesh lines.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(6, 9 * s);
  for (let x = left + step; x < right; x += step) {
    ctx.moveTo(x, top.y);
    ctx.lineTo(x, base.y);
  }
  ctx.stroke();

  // Top cord and posts.
  ctx.strokeStyle = COLORS.ink;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, 2.2 * s);
  ctx.beginPath();
  ctx.moveTo(left, top.y);
  ctx.lineTo(right, top.y);
  ctx.stroke();

  ctx.lineWidth = Math.max(2.5, 3.5 * s);
  ctx.beginPath();
  ctx.moveTo(left, top.y - 2 * s);
  ctx.lineTo(left, base.y + 3 * s);
  ctx.moveTo(right, top.y - 2 * s);
  ctx.lineTo(right, base.y + 3 * s);
  ctx.stroke();
}
