import { MAX_HIT_FORGIVENESS_MS } from "../../shared/constants";

export const FIXED_DT = 1 / 120;

/** Fixed 120 Hz stepper. The host simulation and the guest's own paddle share it. */
export class FixedClock {
  private acc = 0;

  advance(frameDt: number, step: (dt: number) => void) {
    this.acc += Math.min(frameDt, 0.1);
    let guard = 0;
    while (this.acc >= FIXED_DT && guard < 8) {
      this.acc -= FIXED_DT;
      step(FIXED_DT);
      guard++;
    }
  }
}

/** How far back the host rewinds the guest paddle when judging a hit. */
export function forgivenessMs(rttMs: number): number {
  return Math.min(Math.max(0, rttMs) / 2, MAX_HIT_FORGIVENESS_MS);
}
