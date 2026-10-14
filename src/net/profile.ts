import { MAX_NAME_LENGTH } from "../../shared/constants";
import { sanitizeName } from "../../shared/names";

export interface SavedSession {
  code: string;
  playerId: string;
  token: string;
  role: "host" | "guest";
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NAME_KEY = "tt-name";
const SESSION_KEY = "tt-session";

function memoryName(): string {
  const n = Math.floor(100 + Math.random() * 900);
  return `Player ${n}`;
}

function store(kind: "local" | "session"): Store | null {
  try {
    const box = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!box) return null;
    const probe = "__tt_probe";
    box.setItem(probe, "1");
    box.removeItem(probe);
    return box;
  } catch {
    return null;
  }
}

/** Saved name, or a friendly default. Never throws if storage is blocked (E-33). */
export function loadName(): { name: string; saved: boolean } {
  const box = store("local");
  if (!box) return { name: memoryName(), saved: false };
  const raw = box.getItem(NAME_KEY);
  // Names saved before the limit dropped to 12 are shortened, not thrown away.
  const name = sanitizeName((raw ?? "").trim().slice(0, MAX_NAME_LENGTH));
  if (!name) return { name: memoryName(), saved: false };
  return { name, saved: true };
}

export function saveName(name: string): boolean {
  const clean = sanitizeName(name);
  if (!clean) return false;
  const box = store("local");
  if (!box) return false;
  try {
    box.setItem(NAME_KEY, clean);
    return true;
  } catch {
    return false;
  }
}

export function loadSession(): SavedSession | null {
  const box = store("session");
  if (!box) return null;
  try {
    const raw = box.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedSession>;
    if (!data.code || !data.playerId || !data.token || (data.role !== "host" && data.role !== "guest")) return null;
    return { code: data.code, playerId: data.playerId, token: data.token, role: data.role };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  const box = store("session");
  if (!box) return;
  try {
    box.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode */
  }
}

export function clearSession(): void {
  const box = store("session");
  if (!box) return;
  try {
    box.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Newest tab wins (E-22). Equal timestamps yield, so the claimer takes over. */
export function tabClaim(mine: { id: string; at: number }, theirs: { id: string; at: number }): "yield" | "keep" {
  if (theirs.id === mine.id) return "keep";
  return theirs.at >= mine.at ? "yield" : "keep";
}
