/**
 * Server-side access to the Django API (SSR server only, never in the browser bundle: `.server.ts`).
 *
 * Principles (docs/SECURITY.md §8):
 * - The browser's cookies are forwarded unchanged to Django; Django decides on authentication and
 *   authorization. The SSR server contains no authorization logic of its own.
 * - `Set-Cookie` from Django responses is passed back to the browser unchanged.
 * - Write requests carry the browser's CSRF token as a header plus its `Origin`/`Referer`;
 *   Django checks both. The SSR server never bypasses these checks.
 * - Every call is bound to exactly one browser request; there is no shared state.
 * - `X-Forwarded-For` from the reverse proxy is passed on unchanged (rate limits per IP, ADR 0022).
 */
import { CSRF_COOKIE, readCookie, readSetCookie } from "./http";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export const AUTH_BASE = "/_allauth/browser/v1";

type BackendInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  csrfToken?: string | null;
  /** Extra request headers, e.g. allauth's X-Email-Verification-Key. Values must be validated. */
  headers?: Record<string, string>;
  /** Multipart body (file uploads); fetch sets the Content-Type with the boundary itself. */
  form?: FormData;
};

export type BackendResult<T> = {
  status: number;
  data: T | null;
  setCookies: string[];
  /** Location header of a redirect response (redirects are never followed). */
  location: string | null;
};

export async function backendFetch<T = unknown>(
  request: Request,
  path: string,
  init: BackendInit = {},
): Promise<BackendResult<T>> {
  const method = init.method ?? "GET";
  const headers = new Headers({ ...init.headers, Accept: "application/json" });

  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  // For Django behind the proxy (SECURE_PROXY_SSL_HEADER); in production the reverse proxy sets
  // the protocol of the browser request.
  const publicUrl = new URL(request.url);
  headers.set("X-Forwarded-Proto", publicUrl.protocol.replace(":", ""));
  // Public host, so URLs Django builds (e.g. the GitHub callback) point to the frontend, not to
  // the internal backend address (USE_X_FORWARDED_HOST in the Django settings).
  headers.set("X-Forwarded-Host", publicUrl.host);
  // Client address for Django's rate limits per IP (ADR 0022). Passed on unchanged: the reverse
  // proxy overwrites it with the client's address, and Django trusts exactly that one proxy
  // (DJANGO_TRUSTED_PROXY_COUNT). Without a proxy (development) Django ignores the header.
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);

  if (method !== "GET") {
    for (const name of ["Origin", "Referer"] as const) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (init.csrfToken) headers.set("X-CSRFToken", init.csrfToken);
  }

  let body: string | FormData | undefined;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  } else if (init.form !== undefined) {
    body = init.form;
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

  return {
    status: response.status,
    data,
    setCookies: response.headers.getSetCookie(),
    location: response.headers.get("Location"),
  };
}

export type SessionUser = { username: string };

/**
 * Fetches a binary resource (e.g. an image) from Django for streaming it to the browser.
 * Without `request` no cookies are forwarded (public resources such as avatars); with it the
 * browser's session goes along, so Django can check access (e.g. images of private projects).
 */
export async function backendFetchBinary(path: string, request?: Request): Promise<Response> {
  const headers = new Headers({ Accept: "image/webp,image/*" });
  const cookie = request?.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);
  return fetch(new URL(path, BACKEND_URL), { headers, redirect: "manual" });
}

/** Login providers that are configured (e.g. ["github"]); empty without credentials. */
export async function getLoginProviders(request: Request): Promise<string[]> {
  const result = await backendFetch<{ data?: { socialaccount?: { providers?: { id?: string }[] } } }>(
    request,
    `${AUTH_BASE}/config`,
  );
  return (result.data?.data?.socialaccount?.providers ?? []).map((p) => p.id ?? "").filter(Boolean);
}

/** Asks Django for the current session. `null` = not signed in. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const result = await backendFetch<{ data?: { user?: { username?: string } } }>(
    request,
    `${AUTH_BASE}/auth/session`,
  );
  const username = result.data?.data?.user?.username;
  return result.status === 200 && username ? { username } : null;
}

/**
 * Returns the CSRF token for forms. If the browser has no token cookie yet, one is requested from
 * Django; the corresponding `Set-Cookie` must be passed on to the browser.
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
