/**
 * Passkeys in the browser (WebAuthn, WP 1.3b). Uses the standard JSON helpers of the WebAuthn API
 * (PublicKeyCredential.parse*OptionsFromJSON, credential.toJSON()), which match the format
 * allauth/fido2 expect. All requests go to our own resource route /passkeys (same origin).
 */

export const PASSKEY_INTENTS = ["register-options", "register", "login-options", "login", "2fa-options", "2fa"] as const;
export type PasskeyIntent = (typeof PASSKEY_INTENTS)[number];

export type PasskeyResult = {
  ok: boolean;
  /** Page to go to next (after success, or to confirm the password first). */
  next?: string;
  options?: unknown;
  error?: "unsupported" | "cancelled" | "failed" | "unverified" | "rateLimited" | "forbidden" | "generic";
};

/** True if this browser offers passkeys with the JSON helpers. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function"
  );
}

async function call(body: Record<string, unknown>): Promise<PasskeyResult> {
  try {
    const response = await fetch("/passkeys", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as PasskeyResult;
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** allauth wraps the options as {publicKey: {...}} (webauthn-json format). */
function publicKeyOf<T>(options: unknown): T {
  const wrapped = options as { publicKey?: T } | null;
  return (wrapped?.publicKey ?? options) as T;
}

/** The user aborted the browser dialog, or no matching passkey was available. */
function isCancel(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

export async function registerPasskey(csrfToken: string, name: string): Promise<PasskeyResult> {
  if (!passkeysSupported()) return { ok: false, error: "unsupported" };
  const begin = await call({ intent: "register-options", csrf_token: csrfToken });
  if (!begin.ok) return begin;
  try {
    const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(
      publicKeyOf<PublicKeyCredentialCreationOptionsJSON>(begin.options),
    );
    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!credential) return { ok: false, error: "cancelled" };
    return call({ intent: "register", csrf_token: csrfToken, name, credential: credential.toJSON() });
  } catch (error) {
    return { ok: false, error: isCancel(error) ? "cancelled" : "failed" };
  }
}

/** Passwordless login ("login") or passkey as the second factor after the password ("2fa"). */
export async function signInWithPasskey(csrfToken: string, mode: "login" | "2fa", next: string): Promise<PasskeyResult> {
  if (!passkeysSupported()) return { ok: false, error: "unsupported" };
  const begin = await call({ intent: `${mode}-options`, csrf_token: csrfToken });
  if (!begin.ok) return begin;
  try {
    const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(
      publicKeyOf<PublicKeyCredentialRequestOptionsJSON>(begin.options),
    );
    const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    if (!credential) return { ok: false, error: "cancelled" };
    return call({ intent: mode, csrf_token: csrfToken, next, credential: credential.toJSON() });
  } catch (error) {
    return { ok: false, error: isCancel(error) ? "cancelled" : "failed" };
  }
}
