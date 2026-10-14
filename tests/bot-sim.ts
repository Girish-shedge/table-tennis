import { createHash } from "node:crypto";
import type { Difficulty } from "../src/config";
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

/** One seeded vs-Bot match. The paddle wiggle is fixed so only game code can change the trace. */
export function simulate(seed: number, difficulty: Difficulty): string {
  const previous = Math.random;
  Math.random = mulberry32(seed);
  try {
    const game = new Game();
    const lines: string[] = [];
    game.on((e) => {
      if (e.type === "serve" || e.type === "hit") lines.push(`${e.type}:${e.by}:${game.now.toFixed(0)}`);
      else if (e.type === "bounce") lines.push(`bounce:${e.half}`);
      else if (e.type === "net") lines.push("net");
      else if (e.type === "point") lines.push(`point:${e.winner}:${e.reason}:${e.score.player}-${e.score.ai}`);
      else if (e.type === "gameover") lines.push(`gameover:${e.winner}:${e.score.player}-${e.score.ai}`);
    });
    game.startMatch(difficulty);
    const frame = 1 / 60;
    for (let n = 0; n < 60 * 90 && game.phase !== "GAME_OVER"; n++) {
      const wobble = Math.sin(n * 0.07);
      game.keyAxis = { x: wobble > 0.2 ? 1 : wobble < -0.2 ? -1 : 0, z: n % 40 < 20 ? 1 : -1 };
      game.dragTarget = null;
      if (game.phase === "SERVE" && game.server === "player" && n % 30 === 0) game.primary();
      game.update(frame);
    }
    const b = game.ball.pos;
    lines.push(`end:${game.phase}:${game.score.player}-${game.score.ai}:${b.x.toFixed(5)},${b.y.toFixed(5)},${b.z.toFixed(5)}`);
    return lines.join("\n");
  } finally {
    Math.random = previous;
  }
}

export function goldenDigest(): string {
  const chunks = [
    simulate(12345, "easy"),
    simulate(12345, "medium"),
    simulate(12345, "hard"),
    simulate(99, "medium"),
  ];
  return createHash("sha256").update(chunks.join("\n---\n")).digest("hex");
}
