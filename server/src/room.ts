import { DurableObject } from "cloudflare:workers";
import {
  BOTH_DROPPED_WINDOW_MS,
  EXTEND_MS,
  JOIN_WINDOW_MS,
  LOBBY_INACTIVITY_MS,
  MAX_EXTENSIONS,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_SEC,
  PROTOCOL_VERSION,
  RECONNECT_WINDOW_MS,
} from "../../shared/constants";
import { disambiguate, sanitizeName } from "../../shared/names";
import { FORWARDED, parseJsonMessage, type Checkpoint, type Role, type RoomStatus, type SideName } from "../../shared/protocol";
import type { Env } from "./env";

interface SockInfo {
  playerId: string;
  role: Role;
  name: string;
}

type AlarmKind = "join" | "inactivity" | "reconnect" | "both";
type Dropped = Role | "both" | null;

interface RoomData {
  code: string;
  status: RoomStatus;
  hostName: string;
  guestName: string | null;
  hostToken: string;
  guestToken: string | null;
  hostId: string;
  guestId: string | null;
  createdAt: number;
  expiresAt: number;
  extensionsUsed: number;
  version: number;
  joinWindowMs: number;
  inactivityMs: number;
  reconnectMs: number;
  bothMs: number;
  checkpoint: Checkpoint | null;
  alarmKind: AlarmKind | null;
  alarmAt: number | null;
  dropped: Dropped;
}

export type Fail = { ok: false; status: number; error: string };

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function token(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const LIVE = new Set<RoomStatus>(["WAITING", "LOBBY_FULL", "COUNTDOWN", "PLAYING", "PAUSED"]);

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;
  private rate = new Map<string, { t: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
      )`);
      const rows = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM room WHERE id = 1").toArray();
      this.data = rows.length ? (JSON.parse(rows[0].data) as RoomData) : null;
      if (this.data) {
        this.data.alarmKind ??= null;
        this.data.alarmAt ??= null;
        this.data.dropped ??= null;
        this.data.checkpoint ??= null;
      }
    });
  }

  private save() {
    if (!this.data) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      JSON.stringify(this.data),
    );
  }

  private joinWindow(): number {
    return this.data?.joinWindowMs || num(this.env.JOIN_WINDOW_MS, JOIN_WINDOW_MS);
  }
  private extendBy(): number {
    return num(this.env.EXTEND_MS, EXTEND_MS);
  }
  private inactivityMs(): number {
    return this.data?.inactivityMs || num(this.env.LOBBY_INACTIVITY_MS, LOBBY_INACTIVITY_MS);
  }
  private reconnectMs(): number {
    return this.data?.reconnectMs || num(this.env.RECONNECT_WINDOW_MS, RECONNECT_WINDOW_MS);
  }
  private bothMs(): number {
    return this.data?.bothMs || num(this.env.BOTH_DROPPED_WINDOW_MS, BOTH_DROPPED_WINDOW_MS);
  }

  private async schedule(kind: AlarmKind | null, at: number | null) {
    if (!this.data) return;
    this.data.alarmKind = kind;
    this.data.alarmAt = at;
    this.save();
    if (at == null) {
      try {
        await this.ctx.storage.deleteAlarm();
      } catch {
        /* no alarm set */
      }
    } else {
      await this.ctx.storage.setAlarm(at);
    }
  }

  private expireIfDue(now = Date.now()): void {
    if (!this.data) return;
    if (this.data.status === "WAITING" && now >= this.data.expiresAt) {
      this.data.status = "EXPIRED";
      this.data.alarmKind = null;
      this.save();
    }
  }

  private active(): boolean {
    return !!this.data && LIVE.has(this.data.status);
  }

  async create(input: {
    code: string;
    name: string;
    v: number;
    joinWindowMs?: number;
    inactivityMs?: number;
    reconnectMs?: number;
    bothMs?: number;
  }): Promise<
    { ok: true; playerId: string; token: string; expiresAt: number } | Fail
  > {
    if (input.v !== PROTOCOL_VERSION) return { ok: false, status: 409, error: "VERSION_MISMATCH" };
    const name = sanitizeName(input.name);
    if (!name) return { ok: false, status: 400, error: "BAD_NAME" };
    this.expireIfDue();
    if (this.active()) return { ok: false, status: 409, error: "COLLISION" };
    const now = Date.now();
    const playerId = crypto.randomUUID();
    const joinWindowMs = input.joinWindowMs || num(this.env.JOIN_WINDOW_MS, JOIN_WINDOW_MS);
    this.data = {
      code: input.code,
      status: "WAITING",
      hostName: name,
      guestName: null,
      hostToken: token(),
      guestToken: null,
      hostId: playerId,
      guestId: null,
      createdAt: now,
      expiresAt: now + joinWindowMs,
      extensionsUsed: 0,
      version: input.v,
      joinWindowMs,
      inactivityMs: input.inactivityMs || num(this.env.LOBBY_INACTIVITY_MS, LOBBY_INACTIVITY_MS),
      reconnectMs: input.reconnectMs || num(this.env.RECONNECT_WINDOW_MS, RECONNECT_WINDOW_MS),
      bothMs: input.bothMs || num(this.env.BOTH_DROPPED_WINDOW_MS, BOTH_DROPPED_WINDOW_MS),
      checkpoint: null,
      alarmKind: null,
      alarmAt: null,
      dropped: null,
    };
    await this.schedule("join", this.data.expiresAt);
    return { ok: true, playerId, token: this.data.hostToken, expiresAt: this.data.expiresAt };
  }

  /** Host started a different room in this browser (E-7). */
  async closeByHost(hostToken: string): Promise<{ ok: true } | Fail> {
    if (!this.data || this.data.hostToken !== hostToken) return { ok: false, status: 403, error: "FORBIDDEN" };
    if (!this.active()) return { ok: true };
    this.data.status = "ENDED";
    this.data.dropped = null;
    this.save();
    this.broadcast({ t: "room_closed", v: PROTOCOL_VERSION, why: "host_cancelled" });
    await this.schedule(null, null);
    return { ok: true };
  }

  async preview(): Promise<{ ok: true; status: RoomStatus; hostName: string } | Fail> {
    this.expireIfDue();
    if (!this.data) return { ok: false, status: 404, error: "ROOM_NOT_FOUND" };
    if (this.data.status === "EXPIRED") return { ok: false, status: 410, error: "ROOM_EXPIRED" };
    if (this.data.status === "ENDED") return { ok: false, status: 410, error: "ROOM_ENDED" };
    return { ok: true, status: this.data.status, hostName: this.data.hostName };
  }

  async join(input: { name: string; v: number }): Promise<
    { ok: true; playerId: string; token: string; hostName: string } | Fail
  > {
    if (input.v !== PROTOCOL_VERSION) return { ok: false, status: 409, error: "VERSION_MISMATCH" };
    const cleaned = sanitizeName(input.name);
    if (!cleaned) return { ok: false, status: 400, error: "BAD_NAME" };
    this.expireIfDue();
    if (!this.data || this.data.status === "ENDED") return { ok: false, status: 404, error: "ROOM_NOT_FOUND" };
    if (this.data.status === "EXPIRED") return { ok: false, status: 410, error: "ROOM_EXPIRED" };
    if (this.data.status !== "WAITING" || this.data.guestId) return { ok: false, status: 409, error: "ROOM_FULL" };
    const name = disambiguate(cleaned, this.data.hostName);
    const playerId = crypto.randomUUID();
    this.data.guestId = playerId;
    this.data.guestName = name;
    this.data.guestToken = token();
    this.data.status = "LOBBY_FULL";
    await this.schedule("inactivity", Date.now() + this.inactivityMs());
    return { ok: true, playerId, token: this.data.guestToken, hostName: this.data.hostName };
  }

  async extend(hostToken: string): Promise<{ ok: true; expiresAt: number } | Fail> {
    this.expireIfDue();
    if (!this.data) return { ok: false, status: 404, error: "ROOM_NOT_FOUND" };
    if (hostToken !== this.data.hostToken) return { ok: false, status: 403, error: "FORBIDDEN" };
    if (this.data.status !== "WAITING") return { ok: false, status: 409, error: "ROOM_FULL" };
    if (this.data.extensionsUsed >= MAX_EXTENSIONS) return { ok: false, status: 409, error: "ALREADY_EXTENDED" };
    this.data.extensionsUsed += 1;
    this.data.expiresAt += this.extendBy();
    if (this.data.alarmKind === "join") await this.schedule("join", this.data.expiresAt);
    else this.save();
    return { ok: true, expiresAt: this.data.expiresAt };
  }

  async alarm(): Promise<void> {
    if (!this.data?.alarmKind) return;
    const kind = this.data.alarmKind;
    this.data.alarmKind = null;
    this.data.alarmAt = null;
    this.save();
    if (kind === "join" && this.data.status === "WAITING") {
      this.data.status = "EXPIRED";
      this.save();
      this.broadcast({ t: "room_closed", v: PROTOCOL_VERSION, why: "expired" });
      return;
    }
    if (kind === "inactivity" && this.data.status === "LOBBY_FULL") {
      this.data.status = "ENDED";
      this.save();
      this.broadcast({ t: "room_closed", v: PROTOCOL_VERSION, why: "inactivity" });
      return;
    }
    if (kind === "reconnect" && this.data.dropped && this.data.dropped !== "both") {
      this.forfeit(this.data.dropped);
      return;
    }
    if (kind === "both") {
      this.data.status = "ENDED";
      this.data.dropped = null;
      this.save();
      this.broadcast({ t: "room_closed", v: PROTOCOL_VERSION, why: "empty" });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/debug/echo") return this.openEcho();
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    this.expireIfDue();
    if (!this.data || this.data.status === "ENDED" || this.data.status === "EXPIRED") {
      const expired = this.data?.status === "EXPIRED";
      return Response.json({ error: expired ? "ROOM_EXPIRED" : this.data ? "ROOM_ENDED" : "ROOM_NOT_FOUND" }, { status: expired ? 410 : this.data ? 410 : 404 });
    }
    const presented = url.searchParams.get("token") ?? "";
    const role = this.roleFor(presented);
    if (!role) return Response.json({ error: "FORBIDDEN" }, { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const info: SockInfo = {
      playerId: role === "host" ? this.data.hostId : this.data.guestId!,
      role,
      name: role === "host" ? this.data.hostName : this.data.guestName!,
    };
    this.replaceRole(role);
    const recovered = await this.recover(role);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(info);
    server.send(JSON.stringify(this.hello(role)));
    if (recovered) {
      const other: Role = role === "host" ? "guest" : "host";
      this.sendTo(other, { t: "peer_joined", v: PROTOCOL_VERSION, name: info.name });
    } else {
      await this.onSocket(role, info.name, server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** A dropped player came back before the alarm. Updates status before hello. */
  private async recover(role: Role): Promise<boolean> {
    if (!this.data) return false;
    if (this.data.dropped !== role && this.data.dropped !== "both") return false;
    const other: Role = role === "host" ? "guest" : "host";
    if (this.data.dropped === "both") {
      this.data.dropped = other;
      this.data.status = "PAUSED";
      await this.schedule("reconnect", Date.now() + this.reconnectMs());
    } else {
      this.data.dropped = null;
      if (this.data.status === "PAUSED") this.data.status = "PLAYING";
      await this.schedule(null, null);
    }
    return true;
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    const info = ws.deserializeAttachment() as SockInfo | null;
    if (!info || !this.data) {
      if (raw.length <= MAX_MESSAGE_BYTES) ws.send(message);
      return;
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      try {
        ws.close(1009, "too large");
      } catch {
        /* already closed */
      }
      return;
    }
    if (this.flooded(info.playerId)) {
      try {
        ws.close(1008, "rate");
      } catch {
        /* already closed */
      }
      return;
    }
    if (raw === "ping" || raw === "pong") return;
    const msg = parseJsonMessage(raw);
    if (!msg) {
      try {
        ws.close(1003, "malformed");
      } catch {
        /* already closed */
      }
      return;
    }
    if (msg.v !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ t: "error", v: PROTOCOL_VERSION, error: "VERSION_MISMATCH" }));
      return;
    }
    if (FORWARDED.has(msg.t)) this.sendRaw(info.role === "host" ? "guest" : "host", raw);
    if (msg.t === "start_request" && info.role === "host") {
      if (this.data.status !== "LOBBY_FULL" || !this.connected("guest")) {
        const name = this.data.guestName ?? "Your friend";
        ws.send(JSON.stringify({ t: "start_rejected", v: PROTOCOL_VERSION, reason: "not_connected", name }));
        return;
      }
      this.data.status = "COUNTDOWN";
      this.data.dropped = null;
      await this.schedule(null, null);
      ws.send(JSON.stringify({ t: "start_ok", v: PROTOCOL_VERSION }));
      return;
    }
    if (msg.t === "countdown" && info.role === "host" && msg.n === 0 && this.data.status === "COUNTDOWN") {
      this.data.status = "PLAYING";
      this.save();
      return;
    }
    if (msg.t === "checkpoint" && info.role === "host") {
      const score = msg.score as { player?: unknown; ai?: unknown } | undefined;
      const server = msg.server;
      if (!score || typeof score.player !== "number" || typeof score.ai !== "number") return;
      if (server !== "player" && server !== "ai") return;
      this.data.checkpoint = { score: { player: score.player, ai: score.ai }, server: server as SideName };
      this.save();
      return;
    }
    if (msg.t === "match_over" && info.role === "host") {
      this.data.status = "ENDED";
      this.data.dropped = null;
      this.save();
      await this.schedule(null, null);
      return;
    }
    if (msg.t === "rematch_accept" && (this.data.status === "ENDED" || this.data.status === "PLAYING")) {
      this.data.status = "COUNTDOWN";
      this.data.dropped = null;
      this.data.checkpoint = null;
      this.save();
      return;
    }
    if (msg.t === "leave") {
      await this.onLeave(info.role);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const info = ws.deserializeAttachment() as SockInfo | null;
    try {
      ws.close(1006, "error");
    } catch {
      /* already closed */
    }
    if (info) await this.onDisconnect(info.role, ws);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const info = ws.deserializeAttachment() as SockInfo | null;
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    if (code === 4000 || reason === "replaced" || !info) return;
    await this.onDisconnect(info.role, ws);
  }

  private async onSocket(role: Role, name: string, ws: WebSocket) {
    if (!this.data) return;
    if (role === "guest") this.sendTo("host", { t: "peer_joined", v: PROTOCOL_VERSION, name });
    if (role === "host" && this.data.guestName) {
      ws.send(JSON.stringify({ t: "peer_joined", v: PROTOCOL_VERSION, name: this.data.guestName }));
      this.sendTo("guest", { t: "peer_joined", v: PROTOCOL_VERSION, name });
    }
    if (role === "guest" && !this.connected("host", ws)) {
      ws.send(JSON.stringify({ t: "peer_left", v: PROTOCOL_VERSION, name: this.data.hostName, why: "away" }));
    }
  }

  private async onDisconnect(role: Role, except: WebSocket) {
    if (!this.data || !LIVE.has(this.data.status)) return;
    if (this.connected(role, except)) return;
    if (this.data.status === "WAITING") return;
    if (this.data.status === "LOBBY_FULL") {
      const name = role === "host" ? this.data.hostName : (this.data.guestName ?? "Friend");
      const other: Role = role === "host" ? "guest" : "host";
      this.sendTo(other, { t: "peer_left", v: PROTOCOL_VERSION, name, why: "away" });
      return;
    }
    if (this.data.dropped === role) return;
    const other: Role = role === "host" ? "guest" : "host";
    const name = role === "host" ? this.data.hostName : this.data.guestName ?? "Friend";
    if (this.data.dropped && this.data.dropped !== role) {
      this.data.dropped = "both";
      this.data.status = "PAUSED";
      await this.schedule("both", Date.now() + this.bothMs());
      return;
    }
    this.data.dropped = role;
    this.data.status = "PAUSED";
    await this.schedule("reconnect", Date.now() + this.reconnectMs());
    this.sendTo(other, { t: "peer_left", v: PROTOCOL_VERSION, name, why: "reconnecting" });
  }

  private async onLeave(role: Role) {
    if (!this.data) return;
    if (this.data.status === "ENDED" || this.data.status === "EXPIRED") {
      // After the final point: tell the other player, but never reopen a finished room.
      const name = role === "host" ? this.data.hostName : this.data.guestName ?? "Friend";
      this.sendTo(role === "host" ? "guest" : "host", { t: "peer_left", v: PROTOCOL_VERSION, name, why: "left" });
      return;
    }
    if (this.data.status === "COUNTDOWN" || this.data.status === "PLAYING" || this.data.status === "PAUSED") {
      this.forfeit(role);
      await this.schedule(null, null);
      return;
    }
    if (role === "host") {
      this.data.status = "ENDED";
      this.save();
      this.broadcast({ t: "room_closed", v: PROTOCOL_VERSION, why: "host_cancelled" });
      await this.schedule(null, null);
      return;
    }
    await this.releaseGuest();
  }

  private async releaseGuest() {
    if (!this.data) return;
    const name = this.data.guestName ?? "Friend";
    this.data.guestId = null;
    this.data.guestName = null;
    this.data.guestToken = null;
    this.data.status = "WAITING";
    this.data.dropped = null;
    this.data.expiresAt = Date.now() + this.joinWindow();
    await this.schedule("join", this.data.expiresAt);
    this.sendTo("host", { t: "peer_left", v: PROTOCOL_VERSION, name, why: "left" });
  }

  private forfeit(role: Role) {
    if (!this.data) return;
    const other: Role = role === "host" ? "guest" : "host";
    const name = role === "host" ? this.data.hostName : this.data.guestName ?? "Friend";
    this.data.status = "ENDED";
    this.data.dropped = null;
    this.save();
    this.sendTo(other, { t: "peer_left", v: PROTOCOL_VERSION, name, why: "forfeit" });
    this.sendTo(other, { t: "room_closed", v: PROTOCOL_VERSION, why: "forfeit" });
  }

  private flooded(id: string): boolean {
    const now = Date.now();
    const bucket = this.rate.get(id) ?? { t: now, n: 0 };
    if (now - bucket.t >= 1000) {
      bucket.t = now;
      bucket.n = 0;
    }
    bucket.n += 1;
    this.rate.set(id, bucket);
    return bucket.n > MAX_MESSAGES_PER_SEC;
  }

  private openEcho(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private roleFor(presented: string): Role | null {
    if (!this.data || !presented) return null;
    if (presented === this.data.hostToken) return "host";
    if (this.data.guestToken && presented === this.data.guestToken) return "guest";
    return null;
  }

  private hello(role: Role) {
    const peerName = role === "host" ? this.data?.guestName : this.data?.hostName;
    return {
      t: "hello",
      v: PROTOCOL_VERSION,
      role,
      roomStatus: this.data!.status,
      peer: peerName ? { name: peerName } : null,
      checkpoint: this.data!.checkpoint,
    };
  }

  private replaceRole(role: Role) {
    for (const ws of this.ctx.getWebSockets()) {
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role !== role) continue;
      try {
        ws.send(JSON.stringify({ t: "error", v: PROTOCOL_VERSION, error: "DUPLICATE_TAB" }));
        ws.close(4000, "replaced");
      } catch {
        /* already closed */
      }
    }
  }

  private connected(role: Role, except?: WebSocket): boolean {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role === role && ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  private sendRaw(role: Role, raw: string) {
    for (const ws of this.ctx.getWebSockets()) {
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role === role && ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
  }

  private sendTo(role: Role, msg: unknown) {
    const raw = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role === role && ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
  }

  private broadcast(msg: unknown) {
    const raw = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    }
  }
}
