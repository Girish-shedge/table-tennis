import { describe, expect, it } from "vitest";
import { goldenDigest } from "./bot-sim";

/**
 * Seeded vs-Bot trace. Re-captured on 15 Oct 2026 when shot power replaced the random shot depth
 * and Bot stopped missing on purpose (project.md §30.4), and again when shots started following the
 * paddle's angle and soft shots stopped double-bouncing (§30.8). A mismatch means vs-Bot changed again.
 */
const GOLDEN = "7b26347e5a39a35d43e361e79d8d6d8f4ebca31e86f9b121bbdd6a3d98b8b978";

describe("vs-Bot golden", () => {
  it("matches the seeded trace", () => {
    expect(goldenDigest()).toBe(GOLDEN);
  });
});
