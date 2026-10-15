import { PROTOCOL_VERSION } from "../../shared/constants";
import { WebSocketTransport, type Transport } from "./transport";

export type NetHandler = (msg: Record<string, unknown> | string) => void;

/** One socket for the open room. Screens and the match both listen here. */
export class NetClient {
  transport: Transport | null = null;
  /** Smoothed round trip, so one slow ping does not flash a warning. */
  rttMs = 80;
  private rttSamples = 0;
  private handlers = new Set<NetHandler>();
  private pingTimer = 0;
  private pingAt = 0;

  on(handler: NetHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async connect(url: string) {
    this.close();
    this.rttSamples = 0;
    const transport = new WebSocketTransport(url);
    this.transport = transport;
    await transport.ready;
    // A replaced or closed socket can still fire late events; only the current one may speak.
    transport.onMessage((data) => {
      if (this.transport !== transport) return;
      if (data === "pong" || data === "ping") {
        if (data === "pong" && this.pingAt) this.noteRtt(performance.now() - this.pingAt);
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
      if (this.transport !== transport) return;
      for (const handler of this.handlers) handler({ t: "socket_closed" });
    });
    this.pingTimer = window.setInterval(() => {
      this.pingAt = performance.now();
      transport.send("ping");
    }, 1000);
  }

  private noteRtt(sample: number) {
    const s = Math.max(1, sample);
    this.rttMs = this.rttSamples++ === 0 ? s : this.rttMs * 0.7 + s * 0.3;
  }

  /**
   * For state that is stale a moment later (snapshots, paddle positions). If the socket still has a
   * backlog we skip this one: on a slow link the newest message matters, not a queue of old ones.
   */
  sendLossy(msg: Record<string, unknown>) {
    if ((this.transport?.buffered ?? 0) > 8192) return;
    this.send(msg);
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
