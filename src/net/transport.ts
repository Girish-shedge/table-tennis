export interface Transport {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  readonly ready: Promise<void>;
}

/** Native WebSocket. No client library. */
export class WebSocketTransport implements Transport {
  private socket: WebSocket;
  private messageCb: ((data: string) => void) | null = null;
  private closeCb: (() => void) | null = null;
  readonly ready: Promise<void>;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("socket")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (data) this.messageCb?.(data);
    });
    this.socket.addEventListener("close", () => this.closeCb?.());
  }

  send(data: string) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  onMessage(cb: (data: string) => void) {
    this.messageCb = cb;
  }

  onClose(cb: () => void) {
    this.closeCb = cb;
  }

  close() {
    this.socket.close();
  }
}
