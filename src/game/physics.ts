import { CONFIG } from "../config";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Side = "player" | "ai";
export const other = (s: Side): Side => (s === "player" ? "ai" : "player");

export interface Ball {
  pos: Vec3;
  vel: Vec3;
  prev: Vec3;
  visible: boolean;
  /** Who hit (or served) the ball last. */
  lastHitter: Side | null;
  /** Half the ball bounced on since the last hit, and how many times. */
  bouncedOn: Side | null;
  bounceCount: number;
  /** Whether the ball clipped the net since the last hit. */
  netHit: boolean;
  /** Squash animation, decays to 0. */
  squash: number;
  /** Recent positions for the motion trail. */
  trail: Vec3[];
}

export interface Paddle {
  pos: Vec3;
  target: { x: number; z: number };
  vel: { x: number; z: number };
  tilt: number;
  /** Hit squash animation, decays to 0. */
  squash: number;
}

export type BallEvent =
  | { type: "none" }
  | { type: "bounce"; half: Side }
  | { type: "net" }
  | { type: "falloff" }
  | { type: "floor" };

export function makeBall(): Ball {
  const z: Vec3 = { x: 0, y: 0, z: 0 };
  return {
    pos: { ...z },
    vel: { ...z },
    prev: { ...z },
    visible: false,
    lastHitter: null,
    bouncedOn: null,
    bounceCount: 0,
    netHit: false,
    squash: 0,
    trail: [],
  };
}

export function makePaddle(x: number, y: number, z: number): Paddle {
  return { pos: { x, y, z }, target: { x, z }, vel: { x: 0, z: 0 }, tilt: 0, squash: 0 };
}

/** One fixed step of ball motion. Returns the first notable event this step. */
export function stepBall(ball: Ball, dt: number, rulesLive: boolean): BallEvent {
  const { gravity: g, netZ, netHeight, ballR, tableW, tableL, restitution, tableFriction, floorY } = CONFIG;
  const p = ball.pos;
  const v = ball.vel;
  ball.prev = { ...p };

  v.y -= g * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

  ball.squash = Math.max(0, ball.squash - dt * 6);

  if (!rulesLive) {
    return p.y < floorY ? { type: "floor" } : { type: "none" };
  }

  // Net: crossing the net plane below the cord height.
  const crossedNet = (ball.prev.z - netZ) * (p.z - netZ) < 0;
  if (crossedNet && p.y < netHeight + ballR && Math.abs(p.x) < tableW / 2 + CONFIG.netOverhang) {
    const side = Math.sign(ball.prev.z - netZ) || 1;
    p.z = netZ + side * (ballR + 0.005);
    v.z = -v.z * 0.18;
    v.x *= 0.5;
    v.y = Math.min(v.y, 0) * 0.3 - 0.2;
    ball.netHit = true;
    return { type: "net" };
  }

  // Table surface.
  if (p.y <= 0 && v.y < 0) {
    const onTable = Math.abs(p.x) <= tableW / 2 && p.z >= 0 && p.z <= tableL;
    if (onTable) {
      p.y = 0;
      v.y = -v.y * restitution;
      v.x *= tableFriction;
      v.z *= tableFriction;
      ball.squash = 1;
      return { type: "bounce", half: p.z < netZ ? "player" : "ai" };
    }
    // Only report the fall once (when first dipping below the surface).
    if (ball.prev.y > 0) return { type: "falloff" };
  }

  if (p.y < floorY) return { type: "floor" };
  return { type: "none" };
}

/**
 * Build a launch velocity that lands the ball at (tx, 0, tz) with roughly the given
 * horizontal speed, lofting the arc until it clears the net.
 */
export function solveShot(
  from: Vec3,
  tx: number,
  tz: number,
  speed: number,
  opts: { ignoreNet?: boolean } = {},
): Vec3 {
  const { gravity: g, netZ, netHeight, ballR } = CONFIG;
  const dx = tx - from.x;
  const dz = tz - from.z;
  const horiz = Math.max(Math.hypot(dx, dz), 0.05);
  let T = horiz / Math.max(speed, 0.5);
  let out: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 12; i++) {
    const vx = dx / T;
    const vz = dz / T;
    const vy = (0.5 * g * T * T - from.y) / T;
    out = { x: vx, y: vy, z: vz };
    if (opts.ignoreNet) break;
    const tn = (netZ - from.z) / vz;
    if (tn > 0 && tn < T) {
      const yn = from.y + vy * tn - 0.5 * g * tn * tn;
      if (yn < netHeight + ballR + 0.05) {
        T *= 1.12;
        continue;
      }
    }
    break;
  }
  return out;
}

/**
 * Detect whether the ball crossed the paddle's depth plane this step while
 * moving toward the paddle's owner, and is within the hit window.
 */
export function paddleCrossing(ball: Ball, paddle: Paddle, side: Side, hitR: number): boolean {
  const dir = side === "player" ? -1 : 1; // ball must travel toward the owner
  const relVz = ball.vel.z - paddle.vel.z;
  if (relVz * dir <= 0) return false;
  const prevRel = ball.prev.z - paddle.pos.z;
  const rel = ball.pos.z - paddle.pos.z;
  const crossed = side === "player" ? prevRel > 0 && rel <= 0 : prevRel < 0 && rel >= 0;
  if (!crossed) return false;
  if (Math.abs(ball.pos.x - paddle.pos.x) > hitR) return false;
  const yMin = side === "player" ? CONFIG.paddleHitYMin : -0.05;
  const yMax = side === "player" ? CONFIG.paddleHitYMax : 0.8;
  return ball.pos.y >= yMin && ball.pos.y <= yMax;
}
