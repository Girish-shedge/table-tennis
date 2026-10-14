export interface Env {
  ROOM: DurableObjectNamespace;
  GATE: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  /** Optional test overrides. Unset in production, so the shared constants apply. */
  JOIN_WINDOW_MS?: string;
  EXTEND_MS?: string;
  LOBBY_INACTIVITY_MS?: string;
  RECONNECT_WINDOW_MS?: string;
  BOTH_DROPPED_WINDOW_MS?: string;
  DAILY_REQUEST_CAP?: string;
}
