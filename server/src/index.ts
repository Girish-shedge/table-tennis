import { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
}

export { Room };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname.startsWith("/ws/")) {
      const stub = env.ROOM.get(env.ROOM.idFromName("echo"));
      return stub.fetch(request);
    }
    return new Response("tt-relay", { status: 200, headers: { "content-type": "text/plain" } });
  },
};
