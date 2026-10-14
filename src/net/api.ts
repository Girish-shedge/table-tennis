import { PROTOCOL_VERSION } from "../../shared/constants";

export interface RoomCreated {
  code: string;
  playerId: string;
  token: string;
  expiresAt: number;
}

export interface RoomPreview {
  status: string;
  hostName: string;
}

export interface RoomJoined {
  playerId: string;
  token: string;
  hostName: string;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "UNREACHABLE");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error || "BAD_REQUEST");
  return body;
}

function httpBase(relayUrl: string): string {
  return relayUrl.replace(/\/$/, "").replace(/^ws/i, "http");
}

/**
 * One round trip to the relay's root, in ms, or null if it can't be reached in time. The root is
 * answered by the Worker itself (no room, no rate limit), so it measures the network, not the server.
 */
export async function pingRelay(relayUrl: string, timeoutMs = 3000): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(`${httpBase(relayUrl)}/?ping=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    await res.text();
    return performance.now() - start;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export function wsUrl(relayUrl: string, code: string, token: string): string {
  const base = httpBase(relayUrl).replace(/^http/i, "ws");
  return `${base}/ws/${code}?token=${encodeURIComponent(token)}`;
}

export async function createRoom(relayUrl: string, name: string, previous?: { code: string; token: string }): Promise<RoomCreated> {
  return (await call(`${httpBase(relayUrl)}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, v: PROTOCOL_VERSION, previousCode: previous?.code, previousToken: previous?.token }),
  })) as RoomCreated;
}

export async function previewRoom(relayUrl: string, code: string): Promise<RoomPreview> {
  return (await call(`${httpBase(relayUrl)}/api/rooms/${code}`, { method: "GET" })) as RoomPreview;
}

export async function joinRoom(relayUrl: string, code: string, name: string): Promise<RoomJoined> {
  return (await call(`${httpBase(relayUrl)}/api/rooms/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, v: PROTOCOL_VERSION }),
  })) as RoomJoined;
}

export async function extendRoom(relayUrl: string, code: string, token: string): Promise<{ expiresAt: number }> {
  return (await call(`${httpBase(relayUrl)}/api/rooms/${code}/extend`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  })) as { expiresAt: number };
}
