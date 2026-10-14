export type Screen =
  | "start"
  | "creating"
  | "hostLobby"
  | "hostReady"
  | "joinCode"
  | "invite"
  | "joining"
  | "guestLobby"
  | "countdown"
  | "match"
  | "reconnect"
  | "result"
  | "rematch"
  | "leave"
  | "message";

export type Role = "host" | "guest";

export interface Session {
  screen: Screen;
  role: Role | null;
  code: string | null;
  myName: string;
  peerName: string | null;
  hostName: string | null;
  token: string | null;
  playerId: string | null;
  message: string | null;
  slow: boolean;
  youWon: boolean | null;
  you: number;
  them: number;
  rematchFrom: "me" | "peer" | null;
  underneath: Screen | null;
  nameSaved: boolean;
}

export type SessionEvent =
  | { type: "host" }
  | { type: "created"; code: string; token: string; playerId: string }
  | { type: "createSlow" }
  | { type: "createFailed"; message: string }
  | { type: "peerJoined"; name: string }
  | { type: "peerLeft"; name: string; why: string }
  | { type: "start" }
  | { type: "guestStart" }
  | { type: "startRejected"; message: string }
  | { type: "countdownDone" }
  | { type: "matchOver"; youWon: boolean; you: number; them: number }
  | { type: "openJoin" }
  | { type: "submitCode" }
  | { type: "openLink"; code: string; hostName: string }
  | { type: "needName" }
  | { type: "joined"; token: string; playerId: string; hostName: string }
  | { type: "joinFailed"; message: string }
  | { type: "rematch" }
  | { type: "peerRematch" }
  | { type: "acceptRematch" }
  | { type: "rematchTimeout" }
  | { type: "askLeave" }
  | { type: "stay" }
  | { type: "confirmLeave" }
  | { type: "roomClosed"; message: string }
  | { type: "backToMenu" }
  | { type: "cancel" }
  | { type: "disconnected" }
  | { type: "reconnected" };

export function initialSession(myName: string, nameSaved: boolean): Session {
  return {
    screen: "start",
    role: null,
    code: null,
    myName,
    peerName: null,
    hostName: null,
    token: null,
    playerId: null,
    message: null,
    slow: false,
    youWon: null,
    you: 0,
    them: 0,
    rematchFrom: null,
    underneath: null,
    nameSaved,
  };
}

function message(s: Session, key: string, underneath: Screen | null = null): Session {
  return { ...s, screen: "message", message: key, underneath, slow: false };
}

/** Pure screen machine for S01–S14. Copy stays in strings.ts. */
export function reduceSession(s: Session, e: SessionEvent): Session {
  switch (e.type) {
    case "host":
      if (s.screen !== "start" && s.screen !== "message") return s;
      return { ...s, screen: "creating", role: "host", slow: false, message: null, peerName: null, rematchFrom: null };
    case "createSlow":
      return s.screen === "creating" ? { ...s, slow: true } : s;
    case "createFailed":
      return s.screen === "creating" ? message(s, e.message) : s;
    case "created":
      if (s.screen !== "creating") return s;
      return { ...s, screen: "hostLobby", code: e.code, token: e.token, playerId: e.playerId, slow: false };
    case "peerJoined":
      if (s.screen === "hostLobby" || s.screen === "hostReady") {
        return { ...s, screen: "hostReady", peerName: e.name };
      }
      if (s.screen === "reconnect") return { ...s, screen: s.underneath === "match" ? "match" : s.screen, peerName: e.name };
      return { ...s, peerName: e.name };
    case "openJoin":
      return s.screen === "start" ? { ...s, screen: "joinCode", role: "guest" } : s;
    case "submitCode":
      return s.screen === "joinCode" ? { ...s, screen: "joining", role: "guest" } : s;
    case "openLink":
      return {
        ...s,
        role: "guest",
        code: e.code,
        hostName: e.hostName,
        screen: s.nameSaved ? "joining" : "invite",
      };
    case "needName":
      return { ...s, screen: "invite", role: "guest" };
    case "joined":
      if (s.screen !== "joining" && s.screen !== "invite") return s;
      return {
        ...s,
        screen: "guestLobby",
        role: "guest",
        token: e.token,
        playerId: e.playerId,
        hostName: e.hostName,
        peerName: e.hostName,
      };
    case "joinFailed":
      return message(s, e.message);
    case "start":
      if (s.screen !== "hostReady") return s;
      return { ...s, screen: "countdown" };
    case "guestStart":
      if (s.screen !== "guestLobby" && s.screen !== "reconnect") return s;
      return { ...s, screen: "countdown" };
    case "startRejected":
      return s.screen === "hostReady" ? { ...s, message: e.message } : s;
    case "countdownDone":
      return s.screen === "countdown" ? { ...s, screen: "match", you: 0, them: 0, youWon: null } : s;
    case "matchOver":
      if (s.screen !== "match" && s.screen !== "reconnect") return s;
      return { ...s, screen: "result", youWon: e.youWon, you: e.you, them: e.them, rematchFrom: null };
    case "rematch":
      if (s.screen !== "result") return s;
      return { ...s, screen: "rematch", rematchFrom: "me" };
    case "peerRematch":
      if (s.screen === "result" || s.screen === "rematch") return { ...s, screen: "rematch", rematchFrom: s.rematchFrom === "me" ? "me" : "peer" };
      return s;
    case "acceptRematch":
      if (s.screen !== "rematch") return s;
      return { ...s, screen: "countdown", rematchFrom: null, you: 0, them: 0, youWon: null };
    case "rematchTimeout":
      return s.screen === "rematch" && s.rematchFrom === "me" ? { ...s, screen: "result", rematchFrom: null } : s;
    case "askLeave":
      if (s.screen === "leave" || s.screen === "start") return s;
      return { ...s, screen: "leave", underneath: s.screen };
    case "stay":
      return s.screen === "leave" && s.underneath ? { ...s, screen: s.underneath, underneath: null } : s;
    case "confirmLeave":
      return { ...initialSession(s.myName, s.nameSaved), message: null };
    case "peerLeft":
      if (s.screen === "match" || s.screen === "countdown" || s.screen === "reconnect" || s.screen === "result" || s.screen === "rematch") {
        return message({ ...s, peerName: e.name }, e.why === "forfeit" || s.screen === "result" ? "friendLeft" : "friendEnded");
      }
      if (s.screen === "hostReady") return { ...s, screen: "hostLobby", peerName: null };
      if (s.screen === "guestLobby" || s.screen === "hostLobby") return message(s, "friendEnded");
      return s;
    case "roomClosed":
      return message(s, e.message);
    case "disconnected":
      if (s.screen === "match" || s.screen === "countdown" || s.screen === "hostLobby" || s.screen === "hostReady" || s.screen === "guestLobby") {
        return { ...s, screen: "reconnect", underneath: s.screen === "countdown" ? "match" : s.screen };
      }
      return s;
    case "reconnected":
      return s.screen === "reconnect" && s.underneath ? { ...s, screen: s.underneath, underneath: null } : s;
    case "cancel":
      if (s.screen === "creating" || s.screen === "joinCode" || s.screen === "joining" || s.screen === "invite" || s.screen === "hostLobby") {
        return initialSession(s.myName, s.nameSaved);
      }
      return s;
    case "backToMenu":
      return initialSession(s.myName, s.nameSaved);
    default:
      return s;
  }
}
