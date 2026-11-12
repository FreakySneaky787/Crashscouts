/**
 * Serverseitiger Zugriff auf die Django-API (nur im SSR-Server, nie im Browser-Bundle: `.server.ts`).
 *
 * Grundsätze (docs/SECURITY.md §8):
 * - Die Cookies des Browsers werden unverändert an Django weitergereicht; Django entscheidet über
 *   Authentisierung und Berechtigung. Der SSR-Server enthält keine eigene Berechtigungslogik.
 * - `Set-Cookie` aus Django-Antworten wird unverändert an den Browser zurückgegeben.
 * - Schreibende Anfragen tragen das CSRF-Token des Browsers als Header sowie dessen `Origin`/`Referer`;
 *   Django prüft beides. Der SSR-Server umgeht die Prüfung nie.
 * - Jeder Aufruf ist an genau eine Browser-Anfrage gebunden; es gibt keinen geteilten Zustand.
 */
import { CSRF_COOKIE, readCookie, readSetCookie } from "./http";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export const AUTH_BASE = "/_allauth/browser/v1";

type BackendInit = {
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  csrfToken?: string | null;
};

export type BackendResult<T> = {
  status: number;
  data: T | null;
  setCookies: string[];
};

export async function backendFetch<T = unknown>(
  request: Request,
  path: string,
  init: BackendInit = {},
): Promise<BackendResult<T>> {
  const method = init.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });

  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  // Für Django hinter dem Proxy (SECURE_PROXY_SSL_HEADER); in Produktion setzt der Reverse Proxy
  // das Protokoll der Browser-Anfrage.
  headers.set("X-Forwarded-Proto", new URL(request.url).protocol.replace(":", ""));

  if (method !== "GET") {
    for (const name of ["Origin", "Referer"] as const) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (init.csrfToken) headers.set("X-CSRFToken", init.csrfToken);
  }

  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const response = await fetch(new URL(path, BACKEND_URL), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  let data: T | null = null;
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    data = (await response.json()) as T;
  } else {
    await response.body?.cancel();
  }

  return { status: response.status, data, setCookies: response.headers.getSetCookie() };
}

export type SessionUser = { username: string };

/** Fragt Django nach der aktuellen Session. `null` = nicht angemeldet. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const result = await backendFetch<{ data?: { user?: { username?: string } } }>(
    request,
    `${AUTH_BASE}/auth/session`,
  );
  const username = result.data?.data?.user?.username;
  return result.status === 200 && username ? { username } : null;
}

/**
 * Liefert das CSRF-Token für Formulare. Hat der Browser noch kein Token-Cookie, wird eines bei
 * Django angefordert; das zugehörige `Set-Cookie` muss an den Browser weitergegeben werden.
 */
export async function ensureCsrfToken(
  request: Request,
): Promise<{ token: string; setCookies: string[] }> {
  const existing = readCookie(request.headers.get("Cookie"), CSRF_COOKIE);
  if (existing) return { token: existing, setCookies: [] };

  const result = await backendFetch(request, `${AUTH_BASE}/config`);
  const token = readSetCookie(result.setCookies, CSRF_COOKIE);
  if (!token) throw new Error("Backend did not issue a CSRF token");
  return { token, setCookies: result.setCookies.filter((c) => c.startsWith(`${CSRF_COOKIE}=`)) };
}
