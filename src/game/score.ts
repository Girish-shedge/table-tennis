import { CONFIG } from "../config";
import type { Side } from "./physics";

export interface Score {
  player: number;
  ai: number;
}

export function winner(score: Score): Side | null {
  const { winScore, winBy } = CONFIG;
  if (score.player >= winScore && score.player - score.ai >= winBy) return "player";
  if (score.ai >= winScore && score.ai - score.player >= winBy) return "ai";
  return null;
}

/** Who serves given the first server and the current score (switch every 2, every 1 at deuce). */
export function serverFor(firstServer: Side, score: Score): Side {
  const total = score.player + score.ai;
  const deuceStart = (CONFIG.winScore - 1) * 2; // e.g. 20 points played at 10-10
  const swaps = isDeuce(score) ? deuceStart / 2 + (total - deuceStart) : Math.floor(total / 2);
  return swaps % 2 === 0 ? firstServer : firstServer === "player" ? "ai" : "player";
}

export function isDeuce(score: Score): boolean {
  return score.player >= CONFIG.winScore - 1 && score.ai >= CONFIG.winScore - 1;
}
