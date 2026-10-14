import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { POWER, nominalAim, outRisk, rolledAim } from "../src/game/shot";
import { rallyStats } from "./rally-sim";

describe("Bot rally length", () => {
  const easy = rallyStats("easy");
  const medium = rallyStats("medium");
  const hard = rallyStats("hard");

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
  it("drops just past the net at zero power and lands deeper with more", () => {
    expect(nominalAim(0).tz).toBeCloseTo(POWER.shortZ);
    expect(nominalAim(0).tz).toBeGreaterThan(CONFIG.netZ);
    expect(nominalAim(0.5).tz).toBeGreaterThan(nominalAim(0.2).tz);
    expect(nominalAim(0.5).speed).toBeGreaterThan(nominalAim(0.2).speed);
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
