import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

/** Shared counters for per-IP create and lookup limits. */
export class Gate extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS hits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        n INTEGER NOT NULL
      )`);
    });
  }

  /** True when this key is still under the limit for the window. */
  async allow(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const rows = this.ctx.storage.sql
      .exec<{ window_start: number; n: number }>("SELECT window_start, n FROM hits WHERE key = ?", key)
      .toArray();
    let start = now;
    let n = 0;
    if (rows.length && now - rows[0].window_start < windowMs) {
      start = rows[0].window_start;
      n = rows[0].n;
    }
    if (n >= limit) return false;
    this.ctx.storage.sql.exec(
      `INSERT INTO hits (key, window_start, n) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, n = excluded.n`,
      key,
      start,
      n + 1,
    );
    return true;
  }
}
