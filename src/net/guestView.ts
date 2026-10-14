import { INTERP_DELAY_MS, MAX_EXTRAPOLATE_MS } from "../../shared/constants";
import { CONFIG } from "../config";
import type { Game } from "../game/state";
import { flipScore, flipSide, mirrorVec, mirrorX, mirrorZ } from "./mirror";

export interface Snap {
  tick: number;
  receivedAt: number;
  phase: string;
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  hp: { x: number; z: number; tilt: number };
  score: { player: number; ai: number };
  server: "player" | "ai";
}

/** Pick a render pose about 100 ms in the past. Exported for tests. */
export function sampleSnapshots(snaps: Snap[], now: number, delay = INTERP_DELAY_MS): Snap | null {
  if (!snaps.length) return null;
  const target = now - delay;
  let older: Snap | null = null;
  let newer: Snap | null = null;
  for (const snap of snaps) {
    if (snap.receivedAt <= target) older = snap;
    else {
      newer = snap;
      break;
    }
  }
  if (older && newer) {
    const span = newer.receivedAt - older.receivedAt || 1;
    const k = Math.min(1, Math.max(0, (target - older.receivedAt) / span));
    return blend(older, newer, k);
  }
  const last = snaps[snaps.length - 1];
  const late = target - last.receivedAt;
  if (late > 0 && late <= MAX_EXTRAPOLATE_MS) {
    const dt = late / 1000;
    return {
      ...last,
      ball: {
        ...last.ball,
        x: last.ball.x + last.ball.vx * dt,
        y: last.ball.y + last.ball.vy * dt,
        z: last.ball.z + last.ball.vz * dt,
      },
    };
  }
  return last;
}

function blend(a: Snap, b: Snap, k: number): Snap {
  const m = (p: number, q: number) => p + (q - p) * k;
  return {
    ...b,
    ball: {
      x: m(a.ball.x, b.ball.x),
      y: m(a.ball.y, b.ball.y),
      z: m(a.ball.z, b.ball.z),
      vx: b.ball.vx,
      vy: b.ball.vy,
      vz: b.ball.vz,
    },
    hp: { x: m(a.hp.x, b.hp.x), z: m(a.hp.z, b.hp.z), tilt: m(a.hp.tilt, b.hp.tilt) },
    score: b.score,
    phase: b.phase,
    server: b.server,
  };
}

/** Guest draws the host's world, mirrored so the guest is at the near end. */
export class GuestView {
  private snaps: Snap[] = [];
  private newest = -1;
  lastReceivedAt = 0;

  push(msg: Record<string, unknown>, receivedAt: number) {
    const tick = Number(msg.tick);
    if (!Number.isFinite(tick) || tick < this.newest) return;
    const ball = msg.ball as Snap["ball"] | undefined;
    const hp = msg.hp as Snap["hp"] | undefined;
    const score = msg.score as Snap["score"] | undefined;
    if (!ball || !hp || !score) return;
    this.newest = tick;
    this.lastReceivedAt = receivedAt;
    this.snaps.push({
      tick,
      receivedAt,
      phase: String(msg.phase || "RALLY"),
      ball,
      hp,
      score,
      server: msg.server === "ai" ? "ai" : "player",
    });
    const cutoff = receivedAt - 1000;
    while (this.snaps.length > 2 && this.snaps[0].receivedAt < cutoff) this.snaps.shift();
  }

  /** Write the opponent and the ball. The guest's own paddle is left alone. */
  apply(game: Game, now: number) {
    const snap = sampleSnapshots(this.snaps, now);
    if (!snap) return;
    const ball = { x: mirrorX(snap.ball.x), y: snap.ball.y, z: mirrorZ(snap.ball.z) };
    const vel = mirrorVec({ x: snap.ball.vx, y: snap.ball.vy, z: snap.ball.vz });
    game.ball.pos = ball;
    game.ball.prev = { ...ball };
    game.ball.vel = vel;
    game.ball.visible = snap.phase !== "MENU" && snap.phase !== "GAME_OVER";
    const far = { x: mirrorX(snap.hp.x), z: mirrorZ(snap.hp.z) };
    game.aiPaddle.pos.x = far.x;
    game.aiPaddle.pos.z = far.z;
    game.aiPaddle.pos.y = CONFIG.paddleHover;
    game.aiPaddle.tilt = -snap.hp.tilt;
    game.score = flipScore(snap.score);
    game.server = flipSide(snap.server);
    if (snap.phase === "SERVE" || snap.phase === "RALLY" || snap.phase === "POINT" || snap.phase === "GAME_OVER") {
      game.phase = snap.phase;
    }
  }
}
