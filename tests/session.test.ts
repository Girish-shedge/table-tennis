import { describe, expect, it } from "vitest";
import { initialSession, reduceSession, type Session } from "../src/net/session";
import { tabClaim } from "../src/net/profile";

function play(events: Parameters<typeof reduceSession>[1][], start?: Session): Session {
  return events.reduce(reduceSession, start ?? initialSession("Girish", true));
}

describe("session flows §4.6", () => {
  it("host: create, friend joins, start, countdown, result", () => {
    const s = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "matchOver", youWon: true, you: 11, them: 7 },
    ]);
    expect(s.screen).toBe("result");
    expect(s.role).toBe("host");
    expect(s.peerName).toBe("Ravi");
    expect(s.youWon).toBe(true);
  });

  it("creating shows a slow hint, then a failure", () => {
    let s = play([{ type: "host" }, { type: "createSlow" }]);
    expect(s.screen).toBe("creating");
    expect(s.slow).toBe(true);
    s = reduceSession(s, { type: "createFailed", message: "unreachable" });
    expect(s.screen).toBe("message");
    expect(s.message).toBe("unreachable");
  });

  it("guest countdown starts from the guest lobby", () => {
    const s = play([
      { type: "openJoin" },
      { type: "submitCode" },
      { type: "joined", token: "t", playerId: "g", hostName: "Girish" },
      { type: "guestStart" },
      { type: "countdownDone" },
    ]);
    expect(s.screen).toBe("match");
    expect(s.role).toBe("guest");
  });

  it("guest by code lands in the guest lobby", () => {
    const s = play([
      { type: "openJoin" },
      { type: "submitCode" },
      { type: "joined", token: "t", playerId: "g", hostName: "Girish" },
    ]);
    expect(s.screen).toBe("guestLobby");
    expect(s.peerName).toBe("Girish");
  });

  it("guest by link skips the name screen when a name is saved", () => {
    const s = play([{ type: "openLink", code: "KTQR", hostName: "Girish" }, { type: "joined", token: "t", playerId: "g", hostName: "Girish" }]);
    expect(s.screen).toBe("guestLobby");
    expect(s.code).toBe("KTQR");
  });

  it("guest by link asks for a name when none is saved", () => {
    const start = initialSession("Player 482", false);
    const s = reduceSession(start, { type: "openLink", code: "KTQR", hostName: "Girish" });
    expect(s.screen).toBe("invite");
    const next = reduceSession(s, { type: "joined", token: "t", playerId: "g", hostName: "Girish" });
    expect(next.screen).toBe("guestLobby");
  });

  it("rematch keeps the role and returns to the countdown", () => {
    const over = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "matchOver", youWon: false, you: 8, them: 11 },
      { type: "rematch" },
    ]);
    expect(over.screen).toBe("rematch");
    expect(over.rematchFrom).toBe("me");
    const again = reduceSession(over, { type: "acceptRematch" });
    expect(again.screen).toBe("countdown");
    expect(again.role).toBe("host");
    expect(again.you).toBe(0);
  });

  it("a friend leaving the result tells you they left", () => {
    const over = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "matchOver", youWon: true, you: 11, them: 7 },
      { type: "peerLeft", name: "Ravi", why: "left" },
    ]);
    expect(over.screen).toBe("message");
    expect(over.message).toBe("friendLeft");
  });

  it("a rematch request expires back to the result", () => {
    const waiting = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "matchOver", youWon: true, you: 11, them: 9 },
      { type: "rematch" },
      { type: "rematchTimeout" },
    ]);
    expect(waiting.screen).toBe("result");
    expect(waiting.rematchFrom).toBe(null);
  });

  it("the other player's rematch can be accepted", () => {
    const s = play([
      { type: "openJoin" },
      { type: "submitCode" },
      { type: "joined", token: "t", playerId: "g", hostName: "Girish" },
      { type: "countdownDone" },
    ]);
    const guest = { ...s, screen: "result" as const, youWon: false, you: 9, them: 11 };
    const asked = reduceSession(guest, { type: "peerRematch" });
    expect(asked.screen).toBe("rematch");
    expect(asked.rematchFrom).toBe("peer");
    expect(reduceSession(asked, { type: "acceptRematch" }).screen).toBe("countdown");
  });

  it("leave asks, stay returns, confirm goes home", () => {
    const match = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "askLeave" },
    ]);
    expect(match.screen).toBe("leave");
    expect(reduceSession(match, { type: "stay" }).screen).toBe("match");
    expect(reduceSession(match, { type: "confirmLeave" }).screen).toBe("start");
  });

  it("a forfeit mid-match becomes the friend-left message", () => {
    const s = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "peerLeft", name: "Ravi", why: "forfeit" },
    ]);
    expect(s.screen).toBe("message");
    expect(s.message).toBe("friendLeft");
  });

  it("dropping during a match opens reconnect and can return", () => {
    const s = play([
      { type: "host" },
      { type: "created", code: "KTQR", token: "t", playerId: "p" },
      { type: "peerJoined", name: "Ravi" },
      { type: "start" },
      { type: "countdownDone" },
      { type: "disconnected" },
    ]);
    expect(s.screen).toBe("reconnect");
    expect(reduceSession(s, { type: "reconnected" }).screen).toBe("match");
  });

  it("cancel from the host lobby returns to the start screen", () => {
    const s = play([{ type: "host" }, { type: "created", code: "KTQR", token: "t", playerId: "p" }, { type: "cancel" }]);
    expect(s.screen).toBe("start");
    expect(s.role).toBe(null);
  });

  it("start is ignored until the friend has joined", () => {
    const s = play([{ type: "host" }, { type: "created", code: "KTQR", token: "t", playerId: "p" }, { type: "start" }]);
    expect(s.screen).toBe("hostLobby");
  });
});

describe("duplicate tabs", () => {
  it("yields to a newer claim and keeps an older one", () => {
    const mine = { id: "a", at: 10 };
    expect(tabClaim(mine, { id: "b", at: 11 })).toBe("yield");
    expect(tabClaim(mine, { id: "b", at: 9 })).toBe("keep");
    expect(tabClaim(mine, { id: "a", at: 99 })).toBe("keep");
  });
});
