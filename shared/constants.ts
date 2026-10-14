/** Values the client and the relay both use. Keep these in one place so they cannot drift. */

export const PROTOCOL_VERSION = 1;

export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export const JOIN_WINDOW_MS = 2 * 60 * 1000;
export const EXTEND_MS = 2 * 60 * 1000;
export const MAX_EXTENSIONS = 1;
export const LOBBY_INACTIVITY_MS = 5 * 60 * 1000;
export const RECONNECT_WINDOW_MS = 15_000;
export const BOTH_DROPPED_WINDOW_MS = 30_000;
export const REMATCH_TIMEOUT_MS = 30_000;

export const SERVE_TIMER_MS = 10_000;
export const SERVE_TIMEOUTS_BEFORE_PROMPT = 2;

export const SNAPSHOT_HZ = 30;
export const INPUT_HZ = 30;
export const INPUT_KEEPALIVE_HZ = 10;
export const HEARTBEAT_MS = 2000;
export const TIMEOUT_MS = 6000;

export const INTERP_DELAY_MS = 100;
export const MAX_INTERP_DELAY_MS = 260;
export const MAX_EXTRAPOLATE_MS = 160;
export const MAX_HIT_FORGIVENESS_MS = 120;

export const MAX_NAME_LENGTH = 12;
export const LABEL_MAX_CHARS = 10;
export const MAX_MESSAGE_BYTES = 2048;

/** Per socket, above the 30 Hz snapshots and 60 Hz inputs, under a flood. */
export const MAX_MESSAGES_PER_SEC = 80;
export const MAX_ROOMS_PER_IP_PER_MIN = 5;
export const MAX_LOOKUPS_PER_IP_PER_MIN = 20;

/** A very small blocklist. Matched on the trimmed lowercase name. */
export const NAME_BLOCKLIST = ["fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot"];

export function randomRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return out;
}

export function isRoomCode(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of value.toUpperCase()) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
