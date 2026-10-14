import { CONFIG, NET, type Difficulty } from "../config";
import { clamp } from "../render/sketch";
import { AI } from "./ai";
import { AIController, LocalInput, RemoteInput } from "./controllers";
import {
  makeBall,
  makePaddle,
  other,
  paddleCrossing,
  stepBall,
  type Ball,
  type Paddle,
  type Side,
} from "./physics";
import { serverFor, winner, type Score } from "./score";
import { aimWobble, launch, nominalAim, previewPath, rolledAim, serveTx } from "./shot";

export type Phase = "MENU" | "SERVE" | "RALLY" | "POINT" | "GAME_OVER";

export type PointReason = "out" | "net" | "missed" | "double" | "fault";

export type GameEvent =
  | { type: "serve"; by: Side }
  | { type: "hit"; by: Side; speed: number }
  | { type: "bounce"; half: Side }
  | { type: "net" }
  | { type: "point"; winner: Side; reason: PointReason; score: Score }
  | { type: "gameover"; winner: Side; score: Score }
  | { type: "phase"; phase: Phase };

export type Listener = (e: GameEvent) => void;

const FIXED_DT = 1 / 120;

export class Game {
  phase: Phase = "MENU";
  difficulty: Difficulty = "medium";
  score: Score = { player: 0, ai: 0 };
  firstServer: Side = "player";
  server: Side = "player";
  lastPoint: { winner: Side; reason: PointReason } | null = null;

  ball: Ball = makeBall();
  player: Paddle = makePaddle(0, CONFIG.paddleHover, 0.35);
  ai: AI = new AI("medium");
  /** Same Bot instance as `ai`. vs-Bot never swaps this out. */
  private aiController = new AIController(this.ai);
  private local = new LocalInput();
  /** Far human. Unused while externalSim is false, so vs-Bot never eases this. */
  private remote = new RemoteInput();
  /** Host-authoritative or guest-rendered. vs-Bot leaves this false. */
  externalSim = false;
  mpRole: "host" | "guest" | null = null;
  /** Auto-serves in a row. Reset by a deliberate serve. */
  serveStrikes = 0;
  /** Set when the third idle serve should be treated as a disconnect. */
  idleSide: Side | null = null;
  private forgivenFar: { x: number; z: number } | null = null;
  aiPaddle: Paddle = makePaddle(0, CONFIG.aiPaddleHover, CONFIG.aiPaddleZ);

  /** Simulation clock in ms. */
  now = 0;
  private phaseAt = 0;
  private accumulator = 0;
  private hitCounter = 0;
  private listeners: Listener[] = [];

  /** Desired paddle target from input for this frame (drag) or null. */
  dragTarget: { x: number; z: number } | null = null;
  keyAxis = { x: 0, z: 0 };
  /** Shot power 0..1 for the near player (from input) and the far human (from the network). */
  playerPower = 0;
  farPower = 0;

  on(l: Listener) {
    this.listeners.push(l);
  }
  /** Guest applies a host event through the same presenters. */
  emitMp(e: GameEvent) {
    this.emit(e);
  }
  private emit(e: GameEvent) {
    for (const l of this.listeners) l(e);
  }

  get phaseAge() {
    return this.now - this.phaseAt;
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseAt = this.now;
    this.emit({ type: "phase", phase: p });
  }

  // ---- Flow -------------------------------------------------------------

  startMatch(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.ai.setDifficulty(difficulty);
    this.ai.ramp = 0;
    this.score = { player: 0, ai: 0 };
    this.firstServer = "player";
    this.lastPoint = null;
    this.player.pos.x = 0;
    this.player.pos.z = 0.35;
    this.player.target = { x: 0, z: 0.35 };
    this.aiPaddle.pos.x = 0;
    this.aiPaddle.target.x = 0;
    this.beginServe();
  }

  openMenu() {
    this.ball.visible = false;
    this.setPhase("MENU");
  }

  private beginServe() {
    this.server = serverFor(this.firstServer, this.score);
    const b = this.ball;
    b.visible = true;
    b.vel = { x: 0, y: 0, z: 0 };
    b.lastHitter = null;
    b.bouncedOn = null;
    b.bounceCount = 0;
    b.netHit = false;
    b.trail = [];
    this.ai.resetForPoint(this.aiPaddle);
    this.holdBallAboveServer();
    this.setPhase("SERVE");
  }

  private holdBallAboveServer() {
    const b = this.ball;
    if (this.server === "player") {
      // Held just in front of the paddle face so it stays visible.
      const p = this.player.pos;
      b.pos = { x: p.x, y: p.y + 0.14, z: p.z - 0.1 };
    } else {
      const p = this.aiPaddle.pos;
      b.pos = { x: p.x + 0.12, y: p.y - 0.05, z: p.z - 0.02 };
    }
    b.prev = { ...b.pos };
  }

  /** Space / click / tap. */
  primary() {
    if (this.externalSim) {
      if (this.mpRole === "host" && this.phase === "SERVE" && this.server === "player") {
        this.serveStrikes = 0;
        this.serve("player");
      }
      return;
    }
    if (this.phase === "SERVE" && this.server === "player") this.serve("player");
    else if (this.phase === "GAME_OVER") this.startMatch(this.difficulty);
  }

  private serve(by: Side) {
    const b = this.ball;
    if (by === "player") {
      const p = this.player;
      b.vel = launch(b.pos, serveTx(p.pos.x, p.vel.x), rolledAim(this.playerPower, true));
    } else {
      b.vel = this.ai.serve(b.pos);
    }
    b.lastHitter = by;
    b.bouncedOn = null;
    b.bounceCount = 0;
    b.netHit = false;
    this.hitCounter++;
    (by === "player" ? this.player : this.aiPaddle).squash = 1;
    this.emit({ type: "serve", by });
    this.setPhase("RALLY");
  }

  private endPoint(w: Side, reason: PointReason) {
    this.score = { ...this.score, [w]: this.score[w] + 1 };
    this.lastPoint = { winner: w, reason };
    this.ai.updateRamp(this.score.player, this.score.ai);
    this.emit({ type: "point", winner: w, reason, score: this.score });
    this.setPhase("POINT");
  }

  // ---- Update -----------------------------------------------------------

  update(frameDt: number) {
    if (this.externalSim) {
      if (this.mpRole === "guest") this.easeOnly(frameDt);
      return;
    }
    this.accumulator += Math.min(frameDt, 0.1);
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.now += FIXED_DT * 1000;
      this.step(FIXED_DT);
    }
  }

  private step(dt: number) {
    if (this.phase === "MENU") return;
    this.updatePlayerPaddle(dt);

    const b = this.ball;
    this.aiController.apply(this.aiPaddle, {
      dt,
      now: this.now,
      phase: this.phase,
      ball: b,
      hitCounter: this.hitCounter,
    });

    switch (this.phase) {
      case "SERVE":
        this.holdBallAboveServer();
        if (this.server === "ai" && this.now - this.phaseAt > CONFIG.aiServeDelayMs) this.serve("ai");
        break;
      case "RALLY":
        this.stepRally(dt);
        break;
      case "POINT": {
        stepBall(b, dt, false);
        b.trail.unshift({ ...b.pos });
        if (b.trail.length > 24) b.trail.pop();
        if (this.now - this.phaseAt > CONFIG.pointFreezeMs) {
          const w = winner(this.score);
          if (w) {
            b.visible = false;
            this.emit({ type: "gameover", winner: w, score: this.score });
            this.setPhase("GAME_OVER");
          } else {
            this.beginServe();
          }
        }
        break;
      }
      case "GAME_OVER":
        break;
    }
  }

  private updatePlayerPaddle(dt: number) {
    this.local.dragTarget = this.dragTarget;
    this.local.keyAxis = this.keyAxis;
    this.local.apply(this.player, dt);
  }

  private stepRally(dt: number) {
    const b = this.ball;
    const ev = stepBall(b, dt, true);

    // Trail bookkeeping.
    b.trail.unshift({ ...b.pos });
    if (b.trail.length > 24) b.trail.pop();

    const hitter = b.lastHitter!;
    const receiver = other(hitter);

    switch (ev.type) {
      case "bounce":
        this.emit({ type: "bounce", half: ev.half });
        if (ev.half === hitter) {
          this.endPoint(receiver, b.netHit ? "net" : "fault");
          return;
        }
        if (b.bouncedOn === ev.half) {
          b.bounceCount++;
          if (b.bounceCount >= 2) {
            this.endPoint(hitter, "double");
            return;
          }
        } else {
          b.bouncedOn = ev.half;
          b.bounceCount = 1;
        }
        break;
      case "net":
        this.emit({ type: "net" });
        break;
      case "falloff":
      case "floor":
        if (b.bouncedOn === receiver) this.endPoint(hitter, "missed");
        else this.endPoint(receiver, b.netHit ? "net" : "out");
        return;
      case "none":
        break;
    }

    // Paddle hits (only the receiver may hit).
    if (receiver === "player" && paddleCrossing(b, this.player, "player", CONFIG.paddleHitR)) {
      this.playerHit();
    } else if (receiver === "ai") {
      if (this.externalSim) {
        if (this.farHumanReached(b)) this.humanFarHit();
      } else if (paddleCrossing(b, this.aiPaddle, "ai", CONFIG.aiPaddleHitR + this.ai.params.hitBonus)) {
        this.aiHit();
      }
    }

    // Safety: ball escaped far away.
    if (Math.abs(b.pos.x) > 4 || b.pos.z < -2 || b.pos.z > 5) {
      if (b.bouncedOn === receiver) this.endPoint(hitter, "missed");
      else this.endPoint(receiver, "out");
    }
  }

  private playerHit() {
    const b = this.ball;
    const p = this.player;
    // Aim: mostly back toward the middle, angled by where on the face the ball
    // struck and by how fast the paddle was swinging sideways. Extreme swipes
    // or edge hits can push the shot wide. Depth and pace come from the power.
    const offset = b.pos.x - p.pos.x;
    const tx = clamp(b.pos.x * 0.4 + offset * 2.6 + p.vel.x * 0.26 + aimWobble(this.playerPower), -0.9, 0.9);
    const aim = rolledAim(this.playerPower);
    b.vel = launch(b.pos, tx, aim);
    b.pos.z = p.pos.z + 0.01;
    this.afterHit("player", aim.speed);
  }

  /** Dotted serve preview: the nominal flight of your serve right now, or null when it isn't your serve. */
  servePreview(): ReturnType<typeof previewPath> | null {
    if (this.phase !== "SERVE" || this.server !== "player" || !this.ball.visible) return null;
    const p = this.player;
    const vel = launch(this.ball.pos, serveTx(p.pos.x, p.vel.x), nominalAim(this.playerPower, true));
    return previewPath(this.ball.pos, vel);
  }

  private aiHit() {
    const b = this.ball;
    b.vel = this.ai.returnShot(b.pos, this.player.pos.x);
    b.pos.z = this.aiPaddle.pos.z - 0.01;
    this.afterHit("ai", Math.hypot(b.vel.x, b.vel.z));
  }

  private afterHit(by: Side, speed: number) {
    const b = this.ball;
    b.lastHitter = by;
    b.bouncedOn = null;
    b.bounceCount = 0;
    b.netHit = false;
    this.hitCounter++;
    (by === "player" ? this.player : this.aiPaddle).squash = 1;
    this.emit({ type: "hit", by, speed });
  }

  // ---- Online (never called in vs-Bot) ----------------------------------

  enterOnline(role: "host" | "guest") {
    this.externalSim = true;
    this.mpRole = role;
    this.serveStrikes = 0;
    this.idleSide = null;
    this.score = { player: 0, ai: 0 };
    this.firstServer = "player";
    this.server = "player";
    this.lastPoint = null;
    this.player.pos.x = 0;
    this.player.pos.y = CONFIG.paddleHover;
    this.player.pos.z = 0.35;
    this.player.target = { x: 0, z: 0.35 };
    const farZ = CONFIG.tableL - 0.35;
    this.aiPaddle.pos.x = 0;
    this.aiPaddle.pos.y = CONFIG.paddleHover;
    this.aiPaddle.pos.z = farZ;
    this.aiPaddle.target = { x: 0, z: farZ };
    this.ball = makeBall();
    this.ball.visible = true;
    this.holdBallAboveServer();
    this.setPhase("SERVE");
  }

  leaveOnline() {
    this.externalSim = false;
    this.mpRole = null;
    this.forgivenFar = null;
    this.openMenu();
  }

  /** Guest paddle target in host coordinates, already clamped. */
  setFarTarget(target: { x: number; z: number } | null, forgiven: { x: number; z: number } | null) {
    this.remote.target = target;
    this.forgivenFar = forgiven;
  }

  restoreServe(score: { player: number; ai: number }, server: Side) {
    this.score = { player: score.player, ai: score.ai };
    this.server = server;
    this.ball = makeBall();
    this.ball.visible = true;
    this.holdBallAboveServer();
    this.setPhase("SERVE");
  }

  queueFarServe() {
    if (this.mpRole === "host" && this.phase === "SERVE" && this.server === "ai") {
      this.serveStrikes = 0;
      this.serveHumanFar();
    }
  }

  /** One 120 Hz step of the host match. Does not run the Bot. */
  hostStep(dt: number) {
    if (!this.externalSim || this.mpRole !== "host") return;
    if (this.phase === "MENU") return;
    this.now += dt * 1000;
    this.updatePlayerPaddle(dt);
    this.remote.apply(this.aiPaddle, dt);
    switch (this.phase) {
      case "SERVE":
        this.holdBallAboveServer();
        if (this.now - this.phaseAt >= NET.serveTimerMs) {
          const idle = this.server;
          this.serveStrikes++;
          if (this.serveStrikes >= 3) this.idleSide = idle;
          if (idle === "player") this.serve("player");
          else this.serveHumanFar();
        }
        break;
      case "RALLY":
        this.stepRally(dt);
        break;
      case "POINT": {
        stepBall(this.ball, dt, false);
        this.ball.trail.unshift({ ...this.ball.pos });
        if (this.ball.trail.length > 24) this.ball.trail.pop();
        if (this.now - this.phaseAt > CONFIG.pointFreezeMs) {
          const w = winner(this.score);
          if (w) {
            this.ball.visible = false;
            this.emit({ type: "gameover", winner: w, score: this.score });
            this.setPhase("GAME_OVER");
          } else {
            this.beginServe();
          }
        }
        break;
      }
      case "GAME_OVER":
        break;
    }
  }

  private easeOnly(frameDt: number) {
    this.accumulator += Math.min(frameDt, 0.1);
    while (this.accumulator >= FIXED_DT) {
      this.accumulator -= FIXED_DT;
      this.now += FIXED_DT * 1000;
      if (this.phase === "MENU") continue;
      this.updatePlayerPaddle(FIXED_DT);
    }
  }

  private farHumanReached(ball: Ball): boolean {
    const paddle = this.aiPaddle;
    const savedX = paddle.pos.x;
    const savedZ = paddle.pos.z;
    if (this.forgivenFar) {
      paddle.pos.x = this.forgivenFar.x;
      paddle.pos.z = this.forgivenFar.z;
    }
    const hit = paddleCrossing(ball, paddle, "ai", CONFIG.paddleHitR);
    paddle.pos.x = savedX;
    paddle.pos.z = savedZ;
    return hit;
  }

  /** Far human's shot, solved with the same math as the near player, then mirrored back. */
  private humanFarHit() {
    const b = this.ball;
    const p = this.forgivenFar ?? this.aiPaddle.pos;
    const mx = -b.pos.x;
    const mz = CONFIG.tableL - b.pos.z;
    const px = -p.x;
    const pvx = -this.aiPaddle.vel.x;
    const offset = mx - px;
    const tx = clamp(mx * 0.4 + offset * 2.6 + pvx * 0.26 + aimWobble(this.farPower), -0.9, 0.9);
    const aim = rolledAim(this.farPower);
    const vel = launch({ x: mx, y: b.pos.y, z: mz }, tx, aim);
    b.vel = { x: -vel.x, y: vel.y, z: -vel.z };
    b.pos.z = this.aiPaddle.pos.z - 0.01;
    this.afterHit("ai", aim.speed);
  }

  private serveHumanFar() {
    const b = this.ball;
    const p = this.aiPaddle;
    const tx = serveTx(-p.pos.x, -p.vel.x);
    const vel = launch({ x: -b.pos.x, y: b.pos.y, z: CONFIG.tableL - b.pos.z }, tx, rolledAim(this.farPower, true));
    b.vel = { x: -vel.x, y: vel.y, z: -vel.z };
    b.lastHitter = "ai";
    b.bouncedOn = null;
    b.bounceCount = 0;
    b.netHit = false;
    this.hitCounter++;
    p.squash = 1;
    this.emit({ type: "serve", by: "ai" });
    this.setPhase("RALLY");
  }
}
