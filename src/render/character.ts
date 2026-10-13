import { COLORS, CONFIG } from "../config";
import type { Projection } from "./projection";
import { blobPoints, closedSpline, damp, wobble } from "./sketch";

export type Mood = "watch" | "shock" | "dizzy" | "happy";

/**
 * The opponent: a hand-inked blob head with a little sprout, floating above
 * the far end of the table. Original design (not the reference's character).
 */
export class Character {
  mood: Mood = "watch";
  private moodUntil = 0;
  private seed = 7;
  private x = 0;
  private y = 0;
  private vx = 0;
  private tilt = 0;
  private squash = 0;
  private time = 0;
  private initialized = false;

  setMood(m: Mood, holdMs: number, now: number) {
    if (this.mood !== m) {
      this.seed = (this.seed * 16807 + 11) % 2147483647;
      this.squash = 1;
    }
    this.mood = m;
    this.moodUntil = now + holdMs;
  }

  /** `anchorX` / `anchorY` is where the head wants to be (screen px). */
  update(dt: number, now: number, anchorX: number, anchorY: number) {
    this.time += dt;
    if (!this.initialized) {
      this.x = anchorX;
      this.y = anchorY;
      this.initialized = true;
    }
    if (this.mood !== "watch" && now > this.moodUntil) this.mood = "watch";
    const px = this.x;
    this.x = damp(this.x, anchorX, 0.18, dt);
    this.y = damp(this.y, anchorY, 0.25, dt);
    this.vx = (this.x - px) / Math.max(dt, 1e-4);
    this.tilt = damp(this.tilt, Math.max(-0.25, Math.min(0.25, this.vx * 0.0025)), 0.12, dt);
    this.squash = Math.max(0, this.squash - dt * 5);
  }

  /** Reset to the anchor (used when layout changes drastically). */
  snap(anchorX: number, anchorY: number) {
    this.x = anchorX;
    this.y = anchorY;
    this.initialized = true;
  }

  /** Where a speech bubble should attach (screen px). */
  bubbleAnchor(P: Projection): { x: number; y: number } {
    const R = this.radius(P);
    return { x: this.x + R * 0.95, y: this.y - R * 0.8 };
  }

  radius(P: Projection): number {
    return CONFIG.headRadius * P.scaleAt(CONFIG.tableL);
  }

  draw(ctx: CanvasRenderingContext2D, P: Projection, lookAt: { x: number; y: number } | null) {
    const R = this.radius(P);
    const lw = Math.max(2.5, R * 0.1);
    const bob = Math.sin(this.time * 2.4) * R * 0.05;

    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(this.tilt);
    const sq = this.squash;
    ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = lw;

    // Little tuft on top (kept short so it never reaches the scoreboard).
    ctx.beginPath();
    ctx.moveTo(R * 0.12, -R * 0.92);
    ctx.quadraticCurveTo(R * 0.2, -R * 1.12, R * 0.42, -R * 1.18);
    ctx.stroke();
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.ellipse(R * 0.54, -R * 1.22, R * 0.16, R * 0.09, -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head blob.
    const pts = wobble(blobPoints(0, 0, R * 1.02, R * 0.96, 11, this.seed, 0.07), R * 0.02, this.seed + 3);
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    closedSpline(ctx, pts);
    ctx.fill();
    ctx.stroke();

    // Eyes.
    const eyeY = -R * 0.18;
    const eyeDX = R * 0.36;
    const eyeR = R * 0.26;
    const shock = this.mood === "shock";

    if (this.mood === "dizzy") {
      this.drawSpiral(ctx, -eyeDX, eyeY, eyeR * 0.75, lw * 0.7);
      this.drawSpiral(ctx, eyeDX, eyeY, eyeR * 0.75, lw * 0.7);
      // Little orbiting dots.
      for (let i = 0; i < 3; i++) {
        const a = this.time * 5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = COLORS.ink;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.85, -R * 0.95 + Math.sin(a) * R * 0.2, lw * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.mood === "happy") {
      ctx.lineWidth = lw * 0.95;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * eyeDX, eyeY + eyeR * 0.35, eyeR * 0.8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else {
      const er = eyeR * (shock ? 1.18 : 1);
      ctx.fillStyle = COLORS.white;
      ctx.lineWidth = lw * 0.85;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * eyeDX, eyeY, er, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Pupils look toward the ball.
      let lx = 0;
      let ly = 0.15;
      if (lookAt) {
        const dx = lookAt.x - this.x;
        const dy = lookAt.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        lx = dx / len;
        ly = dy / len;
      }
      const pr = er * (shock ? 0.28 : 0.38);
      ctx.fillStyle = COLORS.ink;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * eyeDX + lx * er * 0.42, eyeY + ly * er * 0.42, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mouth.
    ctx.lineWidth = lw * 0.9;
    ctx.fillStyle = COLORS.ink;
    if (this.mood === "happy") {
      ctx.beginPath();
      ctx.arc(0, R * 0.22, R * 0.3, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    } else if (this.mood === "dizzy") {
      ctx.beginPath();
      ctx.ellipse(0, R * 0.38, R * 0.1, R * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const mw = shock ? R * 0.22 : R * 0.16;
      const mh = shock ? R * 0.26 : R * 0.13;
      ctx.beginPath();
      ctx.ellipse(0, R * 0.4, mw, mh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawSpiral(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number) {
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath();
    const turns = 2.2;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      const rr = r * t;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
