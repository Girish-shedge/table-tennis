import { describe, expect, it } from "vitest";
import { isRoomCode, randomRoomCode, ROOM_CODE_ALPHABET } from "../shared/constants";
import { forgivenessMs } from "../src/net/clock";
import { GuestView, sampleSnapshots, type Snap } from "../src/net/guestView";
import { Game } from "../src/game/state";
import { clampGuestTarget, flipScore, flipSide, mirrorVec, mirrorX, mirrorZ } from "../src/net/mirror";

function snap(tick: number, at: number, z: number): Snap {
  return {
    tick,
    receivedAt: at,
    phase: "RALLY",
    ball: { x: 0, y: 0.2, z, vx: 0, vy: 0, vz: 1 },
    hp: { x: 0.1, z: 0.4, tilt: 0 },
    score: { player: 1, ai: 2 },
    server: "player",
  };
}

describe("mirror", () => {
  it("flips x and reflects z across the table", () => {
    expect(mirrorX(0.4)).toBeCloseTo(-0.4);
    expect(mirrorZ(0.3)).toBeCloseTo(2.44);
    expect(mirrorZ(1.2)).toBeCloseTo(1.54);
    expect(mirrorVec({ x: 1, y: 2, z: 3 })).toEqual({ x: -1, y: 2, z: -3 });
  });

  it("flips the score and the server so the viewer is the near player", () => {
    expect(flipScore({ player: 3, ai: 8 })).toEqual({ player: 8, ai: 3 });
    expect(flipSide("player")).toBe("ai");
    expect(flipSide("ai")).toBe("player");
  });
});

describe("interpolation", () => {
  it("blends the two snapshots around 100 ms ago", () => {
    const now = 1000;
    const pose = sampleSnapshots([snap(1, 800, 1), snap(2, 1000, 3)], now, 100);
    expect(pose?.ball.z).toBeCloseTo(2);
  });

  it("drops a snapshot older than the newest tick", () => {
    const view = new GuestView();
    const game = new Game();
    const body = (tick: number, z: number) => ({
      t: "state",
      tick,
      phase: "RALLY",
      ball: { x: 0, y: 0.2, z, vx: 0, vy: 0, vz: 0 },
      hp: { x: 0, z: 0.4, tilt: 0 },
      score: { player: 0, ai: 0 },
      server: "player",
    });
    view.push(body(2, 1), 100);
    view.push(body(1, 9), 200);
    view.apply(game, 100);
    expect(game.ball.pos.z).toBeCloseTo(2.74 - 1);
  });

  it("holds the last pose once extrapolation runs out", () => {
    const pose = sampleSnapshots([snap(1, 0, 1.5)], 500, 100);
    expect(pose?.ball.z).toBeCloseTo(1.5);
  });
});

describe("room codes", () => {
  it("uses four letters and never I, L or O", () => {
    for (let i = 0; i < 30; i++) {
      const code = randomRoomCode();
      expect(isRoomCode(code)).toBe(true);
      expect(code).toHaveLength(4);
      for (const ch of code) expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(true);
      expect(code).not.toMatch(/[ILO]/);
    }
  });
});

describe("guest input clamp", () => {
  it("keeps the far paddle inside the mirrored player half", () => {
    expect(clampGuestTarget(5, 0)).toEqual({ x: 1.525 / 2 + 0.25, z: 2.74 - 1.2 });
    expect(clampGuestTarget(-5, 9)).toEqual({ x: -(1.525 / 2 + 0.25), z: 2.74 - 0.3 });
    const ok = clampGuestTarget(0.2, 2);
    expect(ok).toEqual({ x: 0.2, z: 2 });
  });
});

describe("hit forgiveness", () => {
  it("rewinds by half the ping and never more than 80 ms", () => {
    expect(forgivenessMs(100)).toBe(50);
    expect(forgivenessMs(400)).toBe(120);
    expect(forgivenessMs(0)).toBe(0);
  });
});
