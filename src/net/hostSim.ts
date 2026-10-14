import { INPUT_HZ, INPUT_KEEPALIVE_HZ, SNAPSHOT_HZ } from "../../shared/constants";
import { CONFIG, NET } from "../config";
import type { Game, GameEvent } from "../game/state";
import { FixedClock, forgivenessMs } from "./clock";
import type { NetClient } from "./client";
import { GuestView } from "./guestView";
import { mirrorX, mirrorZ } from "./mirror";

interface Sample {
  t: number;
  x: number;
  z: number;
}

function clampFar(x: number, z: number): { x: number; z: number } {
  const xMax = CONFIG.tableW / 2 + CONFIG.paddleXMargin;
  const zMin = CONFIG.tableL - CONFIG.paddleZMax;
  const zMax = CONFIG.tableL - CONFIG.paddleZMin;
  return {
    x: Math.min(xMax, Math.max(-xMax, x)),
    z: Math.min(zMax, Math.max(zMin, z)),
  };
}

/**
 * Host runs the match and sends snapshots. Guest only eases its own paddle
 * and draws interpolated snapshots, mirrored so it stands at the near end.
 */
export const resumeState: { checkpoint: { score: { player: number; ai: number }; server: "player" | "ai" } | null } = {
  checkpoint: null,
};

export class OnlineMatch {
  private clock = new FixedClock();
  private view = new GuestView();
  private samples: Sample[] = [];
  private target: { x: number; z: number } | null = null;
  private snapAcc = 0;
  private inputAcc = 0;
  private lastSent = { x: 999, z: 999 };
  private seq = 0;
  private tick = 0;
  private reported = false;
  private live = true;
  paused = false;
  private slowWarned = false;
  private guestServeMs = 0;
  private guestStrikes = 0;
  private off: () => void;
  readonly onGuestEvent: (e: GameEvent) => void;
  readonly onFriendEmote: (id: number) => void;

  constructor(
    private game: Game,
    private net: NetClient,
    readonly role: "host" | "guest",
    private onOver: (youWon: boolean, you: number, them: number) => void,
    hooks?: { onGuestEvent?: (e: GameEvent) => void; onFriendEmote?: (id: number) => void },
  ) {
    this.onGuestEvent = hooks?.onGuestEvent ?? (() => {});
    this.onFriendEmote = hooks?.onFriendEmote ?? (() => {});
    this.game.enterOnline(role);
    if (resumeState.checkpoint && role === "host") {
      this.game.restoreServe(resumeState.checkpoint.score, resumeState.checkpoint.server);
      resumeState.checkpoint = null;
    }
    this.game.on((e) => this.forwardEvent(e));
    this.off = this.net.on((msg) => this.onNet(msg));
  }

  get serveLeftMs() {
    if (this.game.phase !== "SERVE") return 0;
    if (this.role === "host") return Math.max(0, NET.serveTimerMs - this.game.phaseAge);
    return this.guestServeMs;
  }

  get strikes() {
    return this.role === "host" ? this.game.serveStrikes : this.guestStrikes;
  }

  stop() {
    this.live = false;
    this.off();
    this.game.leaveOnline();
  }

  silenceMs(now: number) {
    if (!this.viewLast()) return 0;
    return now - this.viewLast();
  }

  private viewLast() {
    return this.role === "guest" ? this.viewLastAt() : 0;
  }

  private viewLastAt() {
    return (this.view as GuestView).lastReceivedAt;
  }

  frame(dt: number) {
    if (this.paused) return;
    if (this.role === "host") {
      this.clock.advance(dt, (step) => {
        const forgiven = this.rewind();
        this.game.setFarTarget(this.target, forgiven);
        this.game.hostStep(step);
        if (this.game.idleSide) {
          const idle = this.game.idleSide;
          this.game.idleSide = null;
          if (idle === "player") this.net.send({ t: "leave" });
          else this.net.send({ t: "event", kind: "idle" });
        }
      });
      this.snapAcc += dt;
      const period = 1 / SNAPSHOT_HZ;
      if (this.snapAcc >= period) {
        this.snapAcc = 0;
        this.sendState();
      }
      return;
    }
    this.game.update(dt);
    this.view.apply(this.game, performance.now());
    this.inputAcc += dt;
    const due = Math.abs(this.game.player.target.x - this.lastSent.x) > 0.002 || Math.abs(this.game.player.target.z - this.lastSent.z) > 0.002;
    const period = due ? 1 / INPUT_HZ : 1 / INPUT_KEEPALIVE_HZ;
    if (this.inputAcc >= period) {
      this.inputAcc = 0;
      this.sendInput(false);
    }
  }

  primary() {
    if (this.role === "host") {
      this.game.primary();
      return;
    }
    if (this.game.phase === "SERVE" && this.game.server === "player") this.sendInput(true);
  }

  private forwardEvent(e: GameEvent) {
    if (!this.live || this.role !== "host") return;
    if (e.type === "phase" || e.type === "gameover") return;
    const body: Record<string, unknown> = { t: "event", kind: e.type };
    if (e.type === "hit" || e.type === "serve") body.by = e.by;
    if (e.type === "hit") body.speed = e.speed;
    if (e.type === "bounce") body.half = e.half;
    if (e.type === "point") {
      body.winner = e.winner;
      body.reason = e.reason;
      this.net.send({ t: "checkpoint", score: this.game.score, server: this.game.server });
    }
    this.net.send(body);
  }

  private flipEvent(msg: Record<string, unknown>): GameEvent {
    const flip = (s: unknown) => (s === "player" ? "ai" : "player");
    const kind = String(msg.kind);
    if (kind === "hit") return { type: "hit", by: flip(msg.by) as "player" | "ai", speed: Number(msg.speed) || 0 };
    if (kind === "serve") return { type: "serve", by: flip(msg.by) as "player" | "ai" };
    if (kind === "bounce") return { type: "bounce", half: flip(msg.half) as "player" | "ai" };
    if (kind === "point") {
      return {
        type: "point",
        winner: flip(msg.winner) as "player" | "ai",
        reason: (msg.reason as "out" | "net" | "missed" | "double" | "fault") || "missed",
        score: { ...this.game.score },
      };
    }
    return { type: "net" };
  }

  private sendInput(serve: boolean) {
    const x = mirrorX(this.game.player.target.x);
    const z = mirrorZ(this.game.player.target.z);
    this.lastSent = { x: this.game.player.target.x, z: this.game.player.target.z };
    this.net.send({ t: "input", seq: ++this.seq, ts: Date.now(), x, z, serve });
  }

  noteLatency(): "wait" | "slow" | null {
    if (this.net.rttMs > 1000) return "wait";
    if (this.net.rttMs > 400 && !this.slowWarned) {
      this.slowWarned = true;
      return "slow";
    }
    return null;
  }

  private sendState(kind: "state" | "state_sync" = "state") {
    const b = this.game.ball;
    const g = this.game;
    this.net.send({
      t: kind,
      tick: ++this.tick,
      phase: g.phase,
      ball: { x: b.pos.x, y: b.pos.y, z: b.pos.z, vx: b.vel.x, vy: b.vel.y, vz: b.vel.z },
      hp: { x: g.player.pos.x, z: g.player.pos.z, tilt: g.player.tilt },
      gp: { x: g.aiPaddle.pos.x, z: g.aiPaddle.pos.z, tilt: g.aiPaddle.tilt },
      score: g.score,
      server: g.server,
      serveMs: g.phase === "SERVE" ? Math.max(0, NET.serveTimerMs - g.phaseAge) : 0,
      strikes: g.serveStrikes,
    });
    if (g.phase === "GAME_OVER" && !this.reported) {
      this.reported = true;
      this.net.send({ t: "match_over", score: g.score });
      this.onOver(g.score.player >= g.score.ai, g.score.player, g.score.ai);
    }
  }

  private onNet(msg: Record<string, unknown> | string) {
    if (typeof msg === "string") return;
    if (msg.t === "pause" || msg.t === "away") this.paused = true;
    if (msg.t === "resume" || msg.t === "back") this.paused = false;
    if ((msg.t === "hello" || msg.t === "peer_joined") && this.role === "host" && this.game.externalSim) {
      this.sendState("state_sync");
    }
    if (this.role === "guest" && msg.t === "event") {
      if (msg.kind === "idle") {
        if (this.game.server === "player") this.net.send({ t: "leave" });
        return;
      }
      this.onGuestEvent(this.flipEvent(msg));
      return;
    }
    if (msg.t === "emote" && typeof msg.id === "number") {
      this.onFriendEmote(msg.id);
      return;
    }
    if (this.role === "guest" && (msg.t === "state" || msg.t === "state_sync")) {
      this.guestServeMs = Number(msg.serveMs) || 0;
      this.guestStrikes = Number(msg.strikes) || 0;
      this.view.push(msg, performance.now());
      if (msg.phase === "GAME_OVER" && !this.reported) {
        this.reported = true;
        const score = msg.score as { player: number; ai: number };
        this.onOver(score.ai >= score.player, score.ai, score.player);
      }
      return;
    }
    if (this.role === "host" && msg.t === "input") {
      const next = clampFar(Number(msg.x), Number(msg.z));
      if (!Number.isFinite(next.x) || !Number.isFinite(next.z)) return;
      this.target = this.limitSpeed(next);
      this.samples.push({ t: this.game.now, x: this.target.x, z: this.target.z });
      const cutoff = this.game.now - 500;
      while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
      if (msg.serve) this.game.queueFarServe();
    }
  }

  private limitSpeed(next: { x: number; z: number }): { x: number; z: number } {
    const prev = this.target ?? this.game.aiPaddle.pos;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const dist = Math.hypot(dx, dz);
    const max = 3;
    if (dist <= max) return next;
    const k = max / dist;
    return clampFar(prev.x + dx * k, prev.z + dz * k);
  }

  private rewind(): { x: number; z: number } | null {
    if (!this.target) return null;
    const when = this.game.now - forgivenessMs(this.net.rttMs);
    let chosen = this.samples[0];
    for (const sample of this.samples) {
      if (sample.t <= when) chosen = sample;
    }
    return chosen ? { x: chosen.x, z: chosen.z } : this.target;
  }
}
