import { describe, expect, it } from "vitest";
import { goldenDigest } from "./bot-sim";

/**
 * Seeded vs-Bot trace. Re-captured on 15 Oct 2026 when shot power replaced the random shot depth
 * and Bot stopped missing on purpose (project.md §30.4). A mismatch means vs-Bot changed again.
 */
const GOLDEN = "6f2719ee07eb27fc992555d7a778fb46738b337689312d3391b18c1174336be9";

describe("vs-Bot golden", () => {
  it("matches the seeded trace", () => {
    expect(goldenDigest()).toBe(GOLDEN);
  });
});
