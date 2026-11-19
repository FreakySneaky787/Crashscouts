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
import { redirect } from "react-router";

import { CSRF_COOKIES, readAnyCookie, readAnySetCookie } from "./http";
import { publicProtocol } from "./proxy.server";

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

/**
 * Headers Django needs behind the SSR server. Without them production Django sees the internal
 * host "backend:8000" (not in ALLOWED_HOSTS) and plain HTTP (redirected by SECURE_SSL_REDIRECT).
 */
function setProxyHeaders(headers: Headers, request: Request) {
  // For Django behind the proxy (SECURE_PROXY_SSL_HEADER); in production the reverse proxy sets
  // the protocol of the browser request.
  headers.set("X-Forwarded-Proto", publicProtocol(request));
  // Public host, so URLs Django builds (e.g. the GitHub callback) point to the frontend, not to
  // the internal backend address (USE_X_FORWARDED_HOST in the Django settings).
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  // Client address for Django's rate limits per IP (ADR 0022). Passed on unchanged: the reverse
  // proxy overwrites it with the client's address, and Django trusts exactly that one proxy
  // (DJANGO_TRUSTED_PROXY_COUNT). Without a proxy (development) Django ignores the header.
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
}

export async function backendFetch<T = unknown>(
  request: Request,
  path: string,
  init: BackendInit = {},
): Promise<BackendResult<T>> {
  const method = init.method ?? "GET";
  const headers = new Headers({ ...init.headers, Accept: "application/json" });

  const cookie = request.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  setProxyHeaders(headers, request);

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
  // A suspended account is read only (WP 7.2): every refused write leads to the explanation on
  // the account page instead of each form's generic error.
  if (method !== "GET" && isSuspendedRefusal(response.status, data)) {
    throw redirect("/account?suspended=1", { headers: { "Cache-Control": "private, no-store" } });
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
 * The same request without the visitor's cookies, for public data that must never depend on who
 * asks (e.g. public profiles). Keeps the proxy headers, so Django still sees the public scheme
 * behind the reverse proxy (found in WP 8.6: without them Django redirected to HTTPS).
 */
export function withoutCookies(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("Cookie");
  return new Request(request.url, { headers });
}

/** Django's write guard answers 403 `{"code": "account_suspended"}` (ADR 0027). */
export function isSuspendedRefusal(status: number, body: unknown): boolean {
  return status === 403 && Boolean(body) && typeof body === "object" && (body as { code?: unknown }).code === "account_suspended";
}

/**
 * Fetches a binary resource (e.g. an image) from Django for streaming it to the browser.
 * Without `request` no cookies are forwarded (public resources such as avatars); with it the
 * browser's session goes along, so Django can check access (e.g. images of private projects).
 */
export async function backendFetchBinary(
  path: string,
  request: Request,
  { withCookies = true }: { withCookies?: boolean } = {},
): Promise<Response> {
  const headers = new Headers({ Accept: "image/webp,image/*" });
  setProxyHeaders(headers, request);
  const cookie = withCookies ? request.headers.get("Cookie") : null;
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
  const existing = readAnyCookie(request.headers.get("Cookie"), CSRF_COOKIES);
  if (existing) return { token: existing, setCookies: [] };

  const result = await backendFetch(request, `${AUTH_BASE}/config`);
  const token = readAnySetCookie(result.setCookies, CSRF_COOKIES);
  if (!token) throw new Error("Backend did not issue a CSRF token");
  return { token, setCookies: result.setCookies.filter((c) => CSRF_COOKIES.some((name) => c.startsWith(`${name}=`))) };
}
