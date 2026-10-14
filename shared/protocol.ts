import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "./constants";

export type Role = "host" | "guest";
export type SideName = "player" | "ai";

export type RoomStatus =
  | "WAITING"
  | "LOBBY_FULL"
  | "COUNTDOWN"
  | "PLAYING"
  | "PAUSED"
  | "ENDED"
  | "EXPIRED";

export type CloseWhy = "expired" | "inactivity" | "host_cancelled" | "host_left" | "forfeit" | "empty";

export interface ScoreSnap {
  player: number;
  ai: number;
}

export interface BallSnap {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface PaddleSnap {
  x: number;
  z: number;
  tilt: number;
}

export interface Checkpoint {
  score: ScoreSnap;
  server: SideName;
}

export interface ApiError {
  error: string;
}

export type ServerToClient =
  | { t: "hello"; v: number; role: Role; roomStatus: RoomStatus; peer: { name: string } | null; checkpoint: Checkpoint | null }
  | { t: "peer_joined"; v: number; name: string }
  | { t: "peer_left"; v: number; name: string; why: string }
  | { t: "room_closed"; v: number; why: CloseWhy | string }
  | { t: "start_ok"; v: number }
  | { t: "start_rejected"; v: number; reason: string }
  | { t: "error"; v: number; error: string };

/** Messages the relay forwards to the other player unchanged. */
export const FORWARDED = new Set([
  "countdown",
  "pause",
  "resume",
  "away",
  "back",
  "input",
  "state",
  "state_sync",
  "event",
  "emote",
  "rematch_request",
  "rematch_accept",
]);

export function parseJsonMessage(raw: string): { t: string; v: number; [key: string]: unknown } | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const msg = data as { t?: unknown; v?: unknown };
  if (typeof msg.t !== "string" || typeof msg.v !== "number") return null;
  if (msg.v !== PROTOCOL_VERSION) return { t: msg.t, v: msg.v };
  return data as { t: string; v: number };
}
