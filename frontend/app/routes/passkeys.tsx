/**
 * Resource route for passkeys (WebAuthn, WP 1.3b). The browser's WebAuthn API needs JavaScript;
 * the page script posts JSON here and this route forwards it to allauth with the browser's
 * cookies, Origin and CSRF token, passing Set-Cookie back. No passkey data is stored here.
 */
import type { Route } from "./+types/passkeys";
import { hasFlow, isFlowPending } from "~/lib/auth";
import { AUTH_BASE, backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";
import { PASSKEY_INTENTS, type PasskeyIntent, type PasskeyResult } from "~/lib/passkeys";

const SETTINGS = "/settings/security";

/** Which allauth endpoint and method serve which step. */
const ROUTES: Record<PasskeyIntent, { method: "GET" | "POST"; path: string }> = {
  "register-options": { method: "GET", path: `${AUTH_BASE}/account/authenticators/webauthn?passwordless` },
  register: { method: "POST", path: `${AUTH_BASE}/account/authenticators/webauthn` },
  "login-options": { method: "GET", path: `${AUTH_BASE}/auth/webauthn/login` },
  login: { method: "POST", path: `${AUTH_BASE}/auth/webauthn/login` },
  "2fa-options": { method: "GET", path: `${AUTH_BASE}/auth/webauthn/authenticate` },
  "2fa": { method: "POST", path: `${AUTH_BASE}/auth/webauthn/authenticate` },
};

function reply(result: PasskeyResult, setCookies: string[] = [], status = 200) {
  const headers = setCookieHeaders(setCookies, privateNoStoreHeaders());
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(result), { status, headers });
}

export async function loader() {
  return new Response("Not found", { status: 404, headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply({ ok: false, error: "generic" }, [], 400);
  }
  const intent = body.intent;
  if (typeof intent !== "string" || !(PASSKEY_INTENTS as readonly string[]).includes(intent)) {
    return reply({ ok: false, error: "generic" }, [], 400);
  }
  const step = ROUTES[intent as PasskeyIntent];
  const json =
    intent === "register"
      ? { name: String(body.name ?? "").slice(0, 100), credential: body.credential }
      : intent === "login" || intent === "2fa"
        ? { credential: body.credential }
        : undefined;

  const result = await backendFetch<{ data?: { creation_options?: unknown; request_options?: unknown } }>(request, step.path, {
    method: step.method,
    csrfToken: typeof body.csrf_token === "string" ? body.csrf_token : null,
    json,
  });

  if (result.status === 200) {
    if (intent.endsWith("options")) {
      const options = result.data?.data?.creation_options ?? result.data?.data?.request_options;
      return reply({ ok: true, options }, result.setCookies);
    }
    const next = intent === "register" ? SETTINGS : safeRedirectPath(body.next, "/account");
    return reply({ ok: true, next }, result.setCookies);
  }
  // Adding a passkey needs a fresh password confirmation first.
  if (result.status === 401 && hasFlow(result.data, "reauthenticate") && intent.startsWith("register")) {
    return reply({ ok: false, next: `/reauthenticate?next=${encodeURIComponent(SETTINGS)}` }, result.setCookies);
  }
  // A passwordless login can still need confirmation of the email address.
  if (result.status === 401 && isFlowPending(result.data, "verify_email")) {
    return reply({ ok: false, error: "unverified" }, result.setCookies, 400);
  }
  const error = result.status === 429 ? "rateLimited" : result.status === 403 ? "forbidden" : "failed";
  return reply({ ok: false, error }, result.setCookies, result.status === 429 ? 429 : 400);
}
