import type { Difficulty } from "../src/config";
import { CONFIG } from "../src/config";
import { Game } from "../src/game/state";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RallyStats {
  points: number;
  /** Bot returns that landed in play, per point. */
  botReturnsPerPoint: number;
  /** Share of incoming balls the bot got back. */
  botReturnRate: number;
  /** Paddle hits (both sides, serves included) per point. */
  hitsPerPoint: number;
  playerPoints: number;
  botPoints: number;
  reasons: Record<string, number>;
}

/**
 * A good scripted player against Bot: tracks the ball to where it will cross the paddle, plays a
 * spread of power from soft to the sweet spot (never into the risky zone), serves at once.
 */
export function rallyStats(difficulty: Difficulty, seed = 7, matches = 6, powerFrom = 0.1, contactSpread = 0.07): RallyStats {
  const previous = Math.random;
  const rand = mulberry32(seed);
  Math.random = rand;
  let points = 0;
  let botHits = 0;
  let botChances = 0;
  let hits = 0;
  let playerPoints = 0;
  let botPoints = 0;
  const reasons: Record<string, number> = {};
  try {
    for (let m = 0; m < matches; m++) {
      const game = new Game();
      game.on((e) => {
        if (e.type === "hit" || e.type === "serve") {
          hits++;
          if (e.by === "player") game.playerPower = powerFrom + rand() * (0.8 - powerFrom);
          if (e.type === "hit" && e.by === "ai") botHits++;
        }
        if (e.type === "point") {
          points++;
          if (e.winner === "player") playerPoints++;
          else botPoints++;
          const key = `${e.winner}:${e.reason}`;
          reasons[key] = (reasons[key] ?? 0) + 1;
        }
      });
      let lastHitter: string | null = null;
      // Real players rarely hit dead centre: an off-centre contact angles the shot (see playerHit).
      let contact = 0;
      game.on((e) => {
        if (e.type === "hit" && e.by === "ai") contact = (rand() * 2 - 1) * contactSpread;
      });
      game.startMatch(difficulty);
      game.playerPower = 0.4;
      for (let n = 0; n < 60 * 60 * 6 && game.phase !== "GAME_OVER"; n++) {
        const b = game.ball;
        if (game.phase === "RALLY" && b.lastHitter !== lastHitter) {
          lastHitter = b.lastHitter;
          if (lastHitter === "player") botChances++;
        }
        if (game.phase !== "RALLY") lastHitter = null;
        let x = game.player.pos.x;
        if (game.phase === "RALLY" && b.lastHitter === "ai" && b.vel.z < -0.05) {
          const t = (game.player.pos.z - b.pos.z) / b.vel.z;
          x = b.pos.x + b.vel.x * Math.max(0, t) - contact;
        }
        game.dragTarget = { x, z: 0.45 };
        if (game.phase === "SERVE" && game.server === "player") game.primary();
        game.update(1 / 60);
      }
    }
  } finally {
    Math.random = previous;
  }
  void CONFIG;
  return {
    points,
    botReturnsPerPoint: botHits / Math.max(1, points),
    botReturnRate: botHits / Math.max(1, botChances),
    hitsPerPoint: hits / Math.max(1, points),
    playerPoints,
    botPoints,
    reasons,
  };
}
