import { PROTOCOL_VERSION } from "../../shared/constants";
import { WebSocketTransport, type Transport } from "./transport";

export type NetHandler = (msg: Record<string, unknown> | string) => void;

/** One socket for the open room. Screens and the match both listen here. */
export class NetClient {
  transport: Transport | null = null;
  private handlers = new Set<NetHandler>();
  private pingTimer = 0;

  on(handler: NetHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async connect(url: string) {
    this.close();
    const transport = new WebSocketTransport(url);
    this.transport = transport;
    await transport.ready;
    transport.onMessage((data) => {
      if (data === "pong" || data === "ping") {
        for (const handler of this.handlers) handler(data);
        return;
      }
      try {
        const msg = JSON.parse(data) as Record<string, unknown>;
        for (const handler of this.handlers) handler(msg);
      } catch {
        /* ignore junk */
      }
    });
    transport.onClose(() => {
      for (const handler of this.handlers) handler({ t: "socket_closed" });
    });
    this.pingTimer = window.setInterval(() => transport.send("ping"), 2000);
  }

  send(msg: Record<string, unknown>) {
    this.transport?.send(JSON.stringify({ v: PROTOCOL_VERSION, ...msg }));
  }

  close() {
    window.clearInterval(this.pingTimer);
    this.transport?.close();
    this.transport = null;
  }
}

export const net = new NetClient();
