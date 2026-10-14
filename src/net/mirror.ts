import { CONFIG } from "../config";
import type { Vec3 } from "../game/physics";
import type { Score } from "../game/score";
import type { SideName } from "../../shared/protocol";

/** Host coordinates to the other end of the table. x flips, z flips around the length. */
export function mirrorX(x: number): number {
  return -x;
}

export function mirrorZ(z: number): number {
  return CONFIG.tableL - z;
}

export function mirrorVec(v: Vec3): Vec3 {
  return { x: -v.x, y: v.y, z: -v.z };
}

/** Near-half z (0.3–1.2) becomes the far human's z (1.54–2.44). */
export function nearZToFar(z: number): number {
  return mirrorZ(z);
}

export function flipScore(score: Score): Score {
  return { player: score.ai, ai: score.player };
}

export function flipSide(side: SideName): SideName {
  return side === "player" ? "ai" : "player";
}
