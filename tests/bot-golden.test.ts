import { describe, expect, it } from "vitest";
import { goldenDigest } from "./bot-sim";

/** Captured from the pre-controller Game. A mismatch means vs-Bot changed. */
const GOLDEN = "bfde56535c7281e3b459acc7c6e4107243aecf7e9d11445ab585eb5755b72a5f";

describe("vs-Bot golden", () => {
  it("matches the seeded trace from before the paddle-controller refactor", () => {
    expect(goldenDigest()).toBe(GOLDEN);
  });
});
