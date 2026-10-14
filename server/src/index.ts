import { isRoomCode, randomRoomCode } from "../../shared/constants";
import type { Env } from "./env";
import { corsHeaders, json, originAllowed } from "./http";
import { Room } from "./room";

export type { Env };
export { Room };

function stub(env: Env, code: string): DurableObjectStub<Room> {
  return env.ROOM.get(env.ROOM.idFromName(code)) as DurableObjectStub<Room>;
}

function requestedCode(request: Request): string | null {
  const host = new URL(request.url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return null;
  const hinted = request.headers.get("x-room-code");
  if (!hinted) return null;
  const code = hinted.toUpperCase();
  return isRoomCode(code) ? code : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (!originAllowed(request.headers.get("Origin"), env)) {
      return json({ error: "ORIGIN_DENIED" }, 403, cors);
    }

    if (url.pathname === "/debug/echo") {
      return stub(env, "echo").fetch(new Request(new URL("/debug/echo", request.url), request));
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") return createRoom(request, env, cors);
    const preview = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})$/);
    if (preview && request.method === "GET") return previewRoom(preview[1].toUpperCase(), env, cors);
    const join = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/join$/);
    if (join && request.method === "POST") return joinRoom(join[1].toUpperCase(), request, env, cors);
    const extend = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/extend$/);
    if (extend && request.method === "POST") return extendRoom(extend[1].toUpperCase(), request, env, cors);

    const ws = url.pathname.match(/^\/ws\/([A-Za-z]{4})$/);
    if (ws && request.headers.get("Upgrade") === "websocket") {
      return stub(env, ws[1].toUpperCase()).fetch(request);
    }

    if (url.pathname === "/") return new Response("tt-relay", { status: 200, headers: cors });
    return json({ error: "ROOM_NOT_FOUND" }, 404, cors);
  },
};

async function readBody(request: Request): Promise<{ name?: unknown; v?: unknown } | null> {
  try {
    return (await request.json()) as { name?: unknown; v?: unknown };
  } catch {
    return null;
  }
}

async function createRoom(request: Request, env: Env, cors: Headers): Promise<Response> {
  const body = await readBody(request);
  if (!body || typeof body.name !== "string" || typeof body.v !== "number") {
    return json({ error: "BAD_REQUEST" }, 400, cors);
  }
  const preferred = requestedCode(request);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = attempt === 0 && preferred ? preferred : randomRoomCode();
    const result = await stub(env, code).create({ code, name: body.name, v: body.v });
    if (result.ok) {
      return json({ code, playerId: result.playerId, token: result.token, expiresAt: result.expiresAt }, 201, cors);
    }
    if (result.error !== "COLLISION") return json({ error: result.error }, result.status, cors);
    if (preferred && attempt === 0) continue;
  }
  return json({ error: "RATE_LIMITED" }, 429, cors);
}

async function previewRoom(code: string, env: Env, cors: Headers): Promise<Response> {
  if (!isRoomCode(code)) return json({ error: "ROOM_NOT_FOUND" }, 404, cors);
  const result = await stub(env, code).preview();
  if (!result.ok) return json({ error: result.error }, result.status, cors);
  return json({ status: result.status, hostName: result.hostName }, 200, cors);
}

async function joinRoom(code: string, request: Request, env: Env, cors: Headers): Promise<Response> {
  if (!isRoomCode(code)) return json({ error: "ROOM_NOT_FOUND" }, 404, cors);
  const body = await readBody(request);
  if (!body || typeof body.name !== "string" || typeof body.v !== "number") {
    return json({ error: "BAD_REQUEST" }, 400, cors);
  }
  const result = await stub(env, code).join({ name: body.name, v: body.v });
  if (!result.ok) return json({ error: result.error }, result.status, cors);
  return json({ playerId: result.playerId, token: result.token, hostName: result.hostName }, 200, cors);
}

async function extendRoom(code: string, request: Request, env: Env, cors: Headers): Promise<Response> {
  if (!isRoomCode(code)) return json({ error: "ROOM_NOT_FOUND" }, 404, cors);
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return json({ error: "FORBIDDEN" }, 401, cors);
  const result = await stub(env, code).extend(token);
  if (!result.ok) return json({ error: result.error }, result.status, cors);
  return json({ expiresAt: result.expiresAt }, 200, cors);
}
