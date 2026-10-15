import { describe, expect, it } from "vitest";
import { CONFIG, type Difficulty } from "../src/config";
import { makeBall, stepBall } from "../src/game/physics";
import { POWER, aimTilt, launch, nominalAim, outRisk, paddleAimX, rolledAim, shotTx } from "../src/game/shot";
import { rallyStats } from "./rally-sim";

/** Pooled over a few seeds, so one unlucky trace does not decide a threshold. */
function pooled(d: Difficulty) {
  const runs = [7, 1, 2].map((seed) => rallyStats(d, seed));
  const reasons: Record<string, number> = {};
  for (const r of runs) for (const [k, n] of Object.entries(r.reasons)) reasons[k] = (reasons[k] ?? 0) + n;
  return { botReturnRate: runs.reduce((s, r) => s + r.botReturnRate, 0) / runs.length, reasons };
}

describe("Bot rally length", () => {
  const easy = pooled("easy");
  const medium = pooled("medium");
  const hard = pooled("hard");

  it("returns most balls, more often on harder modes", () => {
    expect(easy.botReturnRate).toBeGreaterThan(0.78);
    expect(medium.botReturnRate).toBeGreaterThan(0.9);
    expect(hard.botReturnRate).toBeGreaterThan(0.94);
    expect(easy.botReturnRate).toBeLessThan(medium.botReturnRate);
    expect(medium.botReturnRate).toBeLessThan(hard.botReturnRate);
  });

  it("is still beatable on every mode", () => {
    for (const s of [easy, medium, hard]) {
      expect(s.botReturnRate).toBeLessThan(0.995);
      expect(s.reasons["player:missed"] ?? 0).toBeGreaterThan(0);
    }
  });

  it("never misses on purpose (no bot net or out from a reachable ball)", () => {
    for (const s of [easy, medium]) {
      expect(s.reasons["player:net"] ?? 0).toBe(0);
      expect(s.reasons["player:out"] ?? 0).toBe(0);
    }
  });
});

describe("Shot power", () => {
  it("lands past the net at zero power and deeper with more", () => {
    expect(nominalAim(0).tz).toBeCloseTo(POWER.shortZ);
    expect(nominalAim(0).tz).toBeGreaterThan(CONFIG.netZ);
    expect(nominalAim(0.5).tz).toBeGreaterThan(nominalAim(0.2).tz);
    expect(nominalAim(0.5).speed).toBeGreaterThan(nominalAim(0.2).speed);
  });

  it("carries a soft shot to the far paddle instead of bouncing twice", () => {
    for (const p of [0, 0.1, 0.3]) {
      for (const z of [0.3, 0.6, 0.9]) {
        const b = makeBall();
        b.pos = { x: 0, y: 0.15, z };
        b.vel = launch(b.pos, 0, nominalAim(p));
        let bounces = 0;
        while (b.pos.z < CONFIG.aiPaddleZ && b.pos.y > CONFIG.floorY) {
          if (stepBall(b, 1 / 120, true).type === "bounce") bounces++;
        }
        expect(bounces, `power ${p} from z ${z}`).toBe(1);
      }
    }
  });

  it("is safe up to the risk line and always out at full power", () => {
    expect(outRisk(POWER.riskFrom)).toBe(0);
    expect(outRisk(0.8)).toBe(0);
    expect(outRisk(0.95)).toBeGreaterThan(0);
    expect(outRisk(1)).toBe(1);
    for (let i = 0; i < 50; i++) expect(rolledAim(1).tz).toBeGreaterThan(CONFIG.tableL);
    for (let i = 0; i < 50; i++) expect(rolledAim(0.7).tz).toBeLessThanOrEqual(CONFIG.tableL);
  });
});

describe("Paddle angle", () => {
  it("turns toward the centre at the edges", () => {
    expect(aimTilt(-0.76, 0)).toBeGreaterThan(0.3);
    expect(aimTilt(0.76, 0)).toBeLessThan(-0.3);
    expect(aimTilt(0, 0)).toBe(0);
  });

  it("aims back into play from either edge, even on a hard swing outward", () => {
    expect(paddleAimX(-0.76, 0)).toBeGreaterThan(0);
    expect(paddleAimX(0.76, 0)).toBeLessThan(0);
    for (const px of [-1, -0.76, 0, 0.76, 1]) {
      for (const vx of [-8, 0, 8]) {
        for (const off of [-CONFIG.paddleHitR, 0, CONFIG.paddleHitR]) {
          for (let i = 0; i < 20; i++) {
            expect(Math.abs(shotTx(px + off, px, vx, 0.4))).toBeLessThanOrEqual(CONFIG.tableW / 2 - 0.1);
          }
        }
      }
    }
  });
});
