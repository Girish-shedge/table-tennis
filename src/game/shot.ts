import { CONFIG } from "../config";
import { clamp, gaussian } from "../render/sketch";
import { solveShot, type Vec3 } from "./physics";

/**
 * Shot power, 0..1, set by pulling the paddle back before contact.
 * 0 drops the ball just past the net; more power lands deeper and faster.
 * 60–80% is the sweet spot (tightest aim, a little extra pace). Past 85% the ball
 * may sail long, and at 100% it always goes out.
 */
export const POWER = {
  sweetMin: 0.6,
  sweetMax: 0.8,
  riskFrom: 0.85,
  /** Landing depth (table z) at 0 and at full in-play power. */
  shortZ: 1.6,
  deepZ: 2.6,
  /** Horizontal speed (m/s) at 0 and 1. */
  minSpeed: 3.2,
  maxSpeed: 6.5,
  sweetBonus: 0.4,
  serveSpeedScale: 0.92,
};

export const inSweetSpot = (p: number) => p >= POWER.sweetMin && p <= POWER.sweetMax;

/** Chance this shot goes long, from 0 at the risk line to 1 at full power. */
export function outRisk(p: number): number {
  if (p <= POWER.riskFrom) return 0;
  return Math.pow(clamp((p - POWER.riskFrom) / (1 - POWER.riskFrom), 0, 1), 1.5);
}

export interface Aim {
  tz: number;
  speed: number;
}

/** Where a shot of this power is meant to land, without luck. Used for the serve preview too. */
export function nominalAim(power: number, serve = false): Aim {
  const p = clamp(power, 0, 1);
  const tz = POWER.shortZ + (POWER.deepZ - POWER.shortZ) * Math.min(p / POWER.riskFrom, 1);
  let speed = POWER.minSpeed + (POWER.maxSpeed - POWER.minSpeed) * p + (inSweetSpot(p) ? POWER.sweetBonus : 0);
  if (serve) speed *= POWER.serveSpeedScale;
  return { tz, speed };
}

/** The real shot: nominal aim plus a little depth noise (less in the sweet spot) and the out risk. */
export function rolledAim(power: number, serve = false): Aim {
  const aim = nominalAim(power, serve);
  const sweet = inSweetSpot(power);
  let tz = aim.tz + gaussian() * (sweet ? 0.03 : 0.07);
  if (Math.random() < outRisk(power)) tz = CONFIG.tableL + 0.08 + Math.random() * 0.3;
  else tz = clamp(tz, CONFIG.netZ + 0.15, CONFIG.tableL - 0.08);
  return { tz, speed: aim.speed };
}

/** Sideways wobble on a hit: smaller in the sweet spot. */
export const aimWobble = (power: number) => gaussian() * (inSweetSpot(power) ? 0.02 : 0.05);

/** Serve aim across the table, from where the paddle is and how it is moving. No luck, so the preview is honest. */
export function serveTx(paddleX: number, paddleVx: number): number {
  return clamp(paddleX * 0.4 + paddleVx * 0.15, -0.6, 0.6);
}

/** Launch velocity for a shot from `from` aimed at (tx, tz). */
export function launch(from: Vec3, tx: number, aim: Aim): Vec3 {
  return solveShot(from, tx, aim.tz, aim.speed);
}

/**
 * Points along the nominal flight, from the ball to its first landing (table or floor), for the dotted
 * serve preview. Same gravity as the game; net contact is ignored (the solver already clears it).
 */
export function previewPath(from: Vec3, vel: Vec3, maxPoints = 48): { points: Vec3[]; landing: Vec3 } {
  const g = CONFIG.gravity;
  const points: Vec3[] = [{ ...from }];
  const p = { ...from };
  const v = { ...vel };
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    v.y -= g * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    const onTable = Math.abs(p.x) <= CONFIG.tableW / 2 && p.z >= 0 && p.z <= CONFIG.tableL;
    if ((p.y <= 0 && onTable) || p.y <= CONFIG.floorY) {
      const landing = { x: p.x, y: onTable ? 0 : CONFIG.floorY, z: p.z };
      points.push(landing);
      return { points: thin(points, maxPoints), landing };
    }
    points.push({ ...p });
  }
  return { points: thin(points, maxPoints), landing: { ...p } };
}

function thin(points: Vec3[], max: number): Vec3[] {
  if (points.length <= max) return points;
  const out: Vec3[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}
