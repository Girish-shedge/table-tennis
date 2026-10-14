import { DurableObject } from "cloudflare:workers";
import { EXTEND_MS, JOIN_WINDOW_MS, MAX_EXTENSIONS, PROTOCOL_VERSION } from "../../shared/constants";
import type { Checkpoint, Role, RoomStatus } from "../../shared/protocol";
import type { Env } from "./env";

interface SockInfo {
  playerId: string;
  role: Role;
  name: string;
}

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
  checkpoint: Checkpoint | null;
}

export type Fail = { ok: false; status: number; error: string };

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function token(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
      )`);
      const rows = this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM room WHERE id = 1").toArray();
      this.data = rows.length ? (JSON.parse(rows[0].data) as RoomData) : null;
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
    return num(this.env.JOIN_WINDOW_MS, JOIN_WINDOW_MS);
  }

  private extendBy(): number {
    return num(this.env.EXTEND_MS, EXTEND_MS);
  }

  /** Mark a waiting room expired if its clock has run out. */
  private expireIfDue(now = Date.now()): void {
    if (!this.data) return;
    if (this.data.status === "WAITING" && now >= this.data.expiresAt) {
      this.data.status = "EXPIRED";
      this.save();
    }
  }

  private active(): boolean {
    if (!this.data) return false;
    return this.data.status !== "ENDED" && this.data.status !== "EXPIRED";
  }

  async create(input: { code: string; name: string; v: number }): Promise<
    { ok: true; playerId: string; token: string; expiresAt: number } | Fail
  > {
    if (input.v !== PROTOCOL_VERSION) return { ok: false, status: 409, error: "VERSION_MISMATCH" };
    const name = input.name.trim();
    if (!name) return { ok: false, status: 400, error: "BAD_NAME" };
    this.expireIfDue();
    if (this.active()) return { ok: false, status: 409, error: "COLLISION" };
    const now = Date.now();
    const playerId = crypto.randomUUID();
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
      expiresAt: now + this.joinWindow(),
      extensionsUsed: 0,
      version: input.v,
      checkpoint: null,
    };
    this.save();
    return { ok: true, playerId, token: this.data.hostToken, expiresAt: this.data.expiresAt };
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
    const name = input.name.trim();
    if (!name) return { ok: false, status: 400, error: "BAD_NAME" };
    this.expireIfDue();
    if (!this.data || this.data.status === "ENDED") return { ok: false, status: 404, error: "ROOM_NOT_FOUND" };
    if (this.data.status === "EXPIRED") return { ok: false, status: 410, error: "ROOM_EXPIRED" };
    if (this.data.status !== "WAITING" || this.data.guestId) {
      return { ok: false, status: 409, error: "ROOM_FULL" };
    }
    const playerId = crypto.randomUUID();
    this.data.guestId = playerId;
    this.data.guestName = name;
    this.data.guestToken = token();
    this.data.status = "LOBBY_FULL";
    this.save();
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
    this.save();
    return { ok: true, expiresAt: this.data.expiresAt };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/debug/echo") return this.openEcho();
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    this.expireIfDue();
    if (!this.data || this.data.status === "ENDED" || this.data.status === "EXPIRED") {
      const error = this.data?.status === "EXPIRED" ? "ROOM_EXPIRED" : "ROOM_NOT_FOUND";
      const status = this.data?.status === "EXPIRED" ? 410 : 404;
      return Response.json({ error }, { status });
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
    this.closeRole(role);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(info);
    server.send(JSON.stringify(this.hello(role)));
    if (role === "guest") this.sendTo("host", { t: "peer_joined", v: PROTOCOL_VERSION, name: info.name });
    if (role === "host" && this.data.guestName) {
      server.send(JSON.stringify({ t: "peer_joined", v: PROTOCOL_VERSION, name: this.data.guestName }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // Gameplay forwarding arrives in B-5. Echo stays available on the debug socket only.
    const info = ws.deserializeAttachment() as SockInfo | null;
    if (!info) ws.send(message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
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

  private closeRole(role: Role) {
    for (const ws of this.ctx.getWebSockets()) {
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role === role) {
        try {
          ws.close(4000, "replaced");
        } catch {
          /* already closed */
        }
      }
    }
  }

  private sendTo(role: Role, msg: unknown) {
    const raw = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const info = ws.deserializeAttachment() as SockInfo | null;
      if (info?.role === role) ws.send(raw);
    }
  }
}
