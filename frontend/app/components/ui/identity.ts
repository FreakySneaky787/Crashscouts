/** Stable visual identity for people and projects without inline styles (CSP: style-src 'self'). */

export const IDENTITY_HUES = 8;

/** Deterministic hue index 0..7 for a key (e.g. a user or project id). */
export function hueIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % IDENTITY_HUES;
}

/** Up to two initials from a display name: "Aiko Tanaka" → "AT", "pgsnap" → "PG". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return Array.from(words[0] ?? "").slice(0, 2).join("").toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[words.length - 1]?.[0] ?? "")).toUpperCase();
}
