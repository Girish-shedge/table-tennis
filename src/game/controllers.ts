import { CONFIG } from "../config";
import { clamp, damp } from "../render/sketch";
import { AI } from "./ai";
import type { Ball, Paddle } from "./physics";
import { aimTilt } from "./shot";
import type { Phase } from "./state";

/**
 * Each paddle is driven by one of these. vs-Bot uses LocalInput and AIController
 * only. RemoteInput is for a human on the far side and is not called in vs-Bot.
 */
export interface PaddleController {
  apply(paddle: Paddle, dt: number): void;
}

/** Keyboard and pointer target, with the player's 0.07 s easing. */
export class LocalInput implements PaddleController {
  dragTarget: { x: number; z: number } | null = null;
  keyAxis = { x: 0, z: 0 };

  apply(paddle: Paddle, dt: number) {
    const p = paddle;
    if (this.dragTarget) {
      p.target.x = this.dragTarget.x;
      p.target.z = this.dragTarget.z;
    } else {
      p.target.x += this.keyAxis.x * CONFIG.paddleKeySpeedX * dt;
      p.target.z += this.keyAxis.z * CONFIG.paddleKeySpeedZ * dt;
    }
    const xMax = CONFIG.tableW / 2 + CONFIG.paddleXMargin;
    p.target.x = clamp(p.target.x, -xMax, xMax);
    p.target.z = clamp(p.target.z, CONFIG.paddleZMin, CONFIG.paddleZMax);

    const px = p.pos.x;
    const pz = p.pos.z;
    p.pos.x = damp(p.pos.x, p.target.x, CONFIG.paddleSmooth, dt);
    p.pos.z = damp(p.pos.z, p.target.z, CONFIG.paddleSmooth, dt);
    p.vel.x = (p.pos.x - px) / dt;
    p.vel.z = (p.pos.z - pz) / dt;
    p.tilt = damp(p.tilt, aimTilt(p.pos.x, p.vel.x), 0.08, dt);
    p.squash = Math.max(0, p.squash - dt * 6);
  }
}

export interface AiStep {
  dt: number;
  now: number;
  phase: Phase;
  ball: Ball;
  hitCounter: number;
}

/** Wraps the existing Bot. Call order matches the old Game.step body. */
export class AIController {
  constructor(readonly ai: AI) {}

  apply(paddle: Paddle, step: AiStep) {
    const incoming = step.phase === "RALLY" && step.ball.lastHitter === "player";
    if (incoming) this.ai.onIncoming(step.hitCounter, step.now, step.ball, paddle);
    this.ai.update(paddle, step.ball, incoming, step.now, step.dt);
  }
}

/**
 * Far-side human. Target is already in host coordinates. Not used in vs-Bot.
 * z limits are the caller's job (the far half is the mirror of the near half).
 */
export class RemoteInput implements PaddleController {
  target: { x: number; z: number } | null = null;

  apply(paddle: Paddle, dt: number) {
    if (!this.target) return;
    paddle.target.x = this.target.x;
    paddle.target.z = this.target.z;
    const px = paddle.pos.x;
    const pz = paddle.pos.z;
    paddle.pos.x = damp(paddle.pos.x, paddle.target.x, CONFIG.paddleSmooth, dt);
    paddle.pos.z = damp(paddle.pos.z, paddle.target.z, CONFIG.paddleSmooth, dt);
    paddle.vel.x = (paddle.pos.x - px) / dt;
    paddle.vel.z = (paddle.pos.z - pz) / dt;
    paddle.tilt = damp(paddle.tilt, aimTilt(paddle.pos.x, paddle.vel.x), 0.08, dt);
    paddle.squash = Math.max(0, paddle.squash - dt * 6);
  }
}
