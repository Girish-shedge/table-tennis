import { CONFIG } from "../config";
import { clamp, gaussian } from "../render/sketch";
import { solveShot, type Vec3 } from "./physics";

/**
 * Shot power, 0..1, set by pulling the paddle back before contact.
 * 0 is a soft push that still carries to the far paddle (no double bounce); more power lands
 * deeper and faster. 60–80% is the sweet spot (tightest aim, a little extra pace). Past 85% the
 * ball may sail long, and at 100% it always goes out.
 */
export const POWER = {
  sweetMin: 0.6,
  sweetMax: 0.8,
  riskFrom: 0.85,
  /** Landing depth (table z) at 0 and at full in-play power. */
  shortZ: 1.9,
  deepZ: 2.6,
  /** Horizontal speed (m/s) at 0 and 1. */
  minSpeed: 4.0,
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
  else tz = clamp(tz, POWER.shortZ - 0.1, CONFIG.tableL - 0.08);
  return { tz, speed: aim.speed };
}

/**
 * Sideways aim. The paddle angles back toward the opponent's side: from the left end the shot goes
 * to the centre or the right, from the right end to the centre or the left. A sideways swing and
 * where the ball meets the face steer it, but a player's shot never lands outside the side lines.
 */
export const AIM = {
  /** Aim shift per metre the paddle stands off centre (negative: back across the table). */
  cross: -0.2,
  /** Aim shift per m/s of sideways swing, capped at `steerMax`. */
  steer: 0.15,
  steerMax: 0.4,
  /** Aim shift per metre the ball meets the face off its centre. */
  face: 0.8,
  /** Furthest from the centre line a shot is aimed (the side line is at 0.76). */
  edge: 0.6,
  /** Paddle roll (radians) per metre between the paddle and its aim, and the most it rolls. */
  tiltPerM: 0.5,
  tiltMax: 0.5,
};

/** Where the paddle is pointing: the aim before the face offset and luck. Drives the paddle's angle. */
export function paddleAimX(paddleX: number, paddleVx: number): number {
  return AIM.cross * paddleX + clamp(paddleVx * AIM.steer, -AIM.steerMax, AIM.steerMax);
}

/** Paddle roll toward its aim, so you can see where the shot will go. */
export function aimTilt(paddleX: number, paddleVx: number): number {
  return clamp((paddleAimX(paddleX, paddleVx) - paddleX) * AIM.tiltPerM, -AIM.tiltMax, AIM.tiltMax);
}

/** The real sideways target of a hit: paddle aim, face offset and a little wobble (less in the sweet spot). */
export function shotTx(ballX: number, paddleX: number, paddleVx: number, power: number): number {
  const wobble = gaussian() * (inSweetSpot(power) ? 0.02 : 0.05);
  return clamp(paddleAimX(paddleX, paddleVx) + (ballX - paddleX) * AIM.face + wobble, -AIM.edge, AIM.edge);
}

/** Serve aim across the table: where the paddle points (as for a hit). No luck, so the preview is honest. */
export function serveTx(paddleX: number, paddleVx: number): number {
  return clamp(paddleAimX(paddleX, paddleVx), -AIM.edge, AIM.edge);
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
