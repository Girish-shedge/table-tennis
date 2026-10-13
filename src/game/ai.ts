import { CONFIG, type Difficulty, type DifficultyParams } from "../config";
import { clamp, damp, gaussian } from "../render/sketch";
import { solveShot, type Ball, type Paddle, type Vec3 } from "./physics";

/**
 * Opponent controller. Tracks the incoming ball with a reaction delay, speed
 * cap and aim error; returns shots aimed into the player's half.
 */
export class AI {
  params: DifficultyParams;
  difficulty: Difficulty;
  /** -1 (AI is far ahead → ease off) .. +1 (player far ahead → sharpen). */
  ramp = 0;
  private trackError = 0;
  private reactAt = 0;
  private targetX = 0;
  private incomingId = -1;

  constructor(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.params = CONFIG.difficulty[difficulty];
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.params = CONFIG.difficulty[d];
  }

  /** Rubber-band: nudge toward the player when behind, ease off when ahead. */
  updateRamp(playerScore: number, aiScore: number) {
    this.ramp = clamp((playerScore - aiScore) / 5, -1, 1);
  }

  private get sigma() {
    return this.params.sigma * (1 - 0.3 * this.ramp);
  }
  private get reaction() {
    return this.params.reactionMs * (1 - 0.25 * this.ramp);
  }
  private get speedCap() {
    return this.params.speedCap * (1 + 0.15 * this.ramp);
  }

  /** Called when the player hits a ball toward the AI. `hitId` distinguishes shots. */
  onIncoming(hitId: number, now: number, ball: Ball, paddle: Paddle) {
    if (this.incomingId === hitId) return;
    this.incomingId = hitId;
    this.reactAt = now + this.reaction;
    // Error grows with how far the paddle will have to travel.
    const t = ball.vel.z > 0.05 ? (paddle.pos.z - ball.pos.z) / ball.vel.z : 0.5;
    const predicted = ball.pos.x + ball.vel.x * Math.max(t, 0);
    const travel = Math.abs(predicted - paddle.pos.x);
    const sigma = Math.hypot(this.sigma, CONFIG.aiDistanceError * travel);
    this.trackError = gaussian() * sigma;
  }

  /** Move the AI paddle. `incoming` is true while the ball is heading toward the AI. */
  update(paddle: Paddle, ball: Ball, incoming: boolean, now: number, dt: number) {
    let desired: number;
    if (incoming && now >= this.reactAt && ball.vel.z > 0.05) {
      const t = (paddle.pos.z - ball.pos.z) / ball.vel.z;
      const predicted = ball.pos.x + ball.vel.x * Math.max(t, 0);
      desired = predicted + this.trackError;
    } else if (incoming) {
      desired = paddle.pos.x; // still reacting
    } else {
      desired = ball.visible ? ball.pos.x * 0.25 : 0; // drift toward center
    }
    desired = clamp(desired, -CONFIG.tableW / 2 - 0.2, CONFIG.tableW / 2 + 0.2);

    // Speed-capped approach.
    const maxStep = this.speedCap * dt;
    const dx = clamp(desired - this.targetX, -maxStep, maxStep);
    this.targetX += dx;
    paddle.target.x = this.targetX;

    const prevX = paddle.pos.x;
    paddle.pos.x = damp(paddle.pos.x, paddle.target.x, 0.06, dt);
    paddle.vel.x = (paddle.pos.x - prevX) / dt;
    paddle.vel.z = 0;
    paddle.tilt = damp(paddle.tilt, clamp(paddle.vel.x * 0.3, -0.45, 0.45), 0.08, dt);
    paddle.squash = Math.max(0, paddle.squash - dt * 6);
  }

  /** Reset tracking between points. */
  resetForPoint(paddle: Paddle) {
    this.incomingId = -1;
    this.targetX = paddle.pos.x;
  }

  /** Velocity for a return shot toward the player's half. */
  returnShot(from: Vec3, playerX: number): Vec3 {
    const p = this.params;
    const faultChance = { easy: 0.11, medium: 0.065, hard: 0.03 }[this.difficulty];
    if (Math.random() < faultChance * (1 - 0.4 * this.ramp)) {
      // Deliberate mistake: either wide or into the net.
      if (Math.random() < 0.5) {
        const side = Math.random() < 0.5 ? -1 : 1;
        return solveShot(from, side * 0.95, 0.6 + Math.random() * 0.4, p.returnSpeed);
      }
      return solveShot(from, (Math.random() - 0.5) * 0.6, 1.25, p.returnSpeed * 1.1, { ignoreNet: true });
    }

    const awayFromPlayer = -Math.sign(playerX || (Math.random() - 0.5));
    const sideSign = Math.random() < p.cornerBias ? awayFromPlayer : Math.random() < 0.5 ? -1 : 1;
    let tx = sideSign * (0.1 + Math.random() * p.aimSpread) + gaussian() * this.sigma * 0.7;
    tx = clamp(tx, -0.78, 0.78);
    const tz = 0.45 + Math.random() * 0.6;
    const speed = p.returnSpeed * (0.92 + Math.random() * 0.16) * (1 + 0.1 * this.ramp);
    return solveShot(from, tx, tz, speed);
  }

  /** Velocity for a serve toward the player's half. */
  serve(from: Vec3): Vec3 {
    const p = this.params;
    const tx = clamp((Math.random() - 0.5) * 1.1 + gaussian() * this.sigma * 0.5, -0.7, 0.7);
    const tz = 0.5 + Math.random() * 0.55;
    return solveShot(from, tx, tz, p.serveSpeed);
  }
}
