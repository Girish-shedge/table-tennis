import { MAX_NAME_LENGTH, NAME_BLOCKLIST } from "./constants";

/** Trim, strip control characters, and reject empty, long, or blocked names. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (cleaned.length < 1 || cleaned.length > MAX_NAME_LENGTH) return null;
  const lower = cleaned.toLowerCase();
  if (NAME_BLOCKLIST.some((word) => lower.includes(word))) return null;
  return cleaned;
}

/** Two players with the same name: the guest is shown as "Name (2)". */
export function disambiguate(name: string, taken: string | null): string {
  if (!taken || name.toLowerCase() !== taken.toLowerCase()) return name;
  const suffix = " (2)";
  return name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
}
