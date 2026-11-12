/**
 * Pure helpers for allauth headless responses (no I/O; shared by the auth routes, unit-tested).
 *
 * Error responses look like {"status": 400, "errors": [{"message", "code", "param"}]}.
 * Messages from the backend are never shown directly: codes are mapped to i18n keys, so every UI
 * text stays in the translation files and no backend detail leaks into the page.
 */

export type AllauthError = { code?: string; param?: string; message?: string };
export type AllauthBody = {
  status?: number;
  errors?: AllauthError[];
  data?: { flows?: { id?: string; is_pending?: boolean }[] };
};

/** Error codes the UI explains specifically; anything else gets a generic per-field message. */
export const KNOWN_ERROR_CODES = [
  "required",
  "invalid",
  "invalid_username",
  "username_taken",
  "username_blacklisted",
  "password_too_short",
  "password_too_long",
  "password_too_common",
  "password_entirely_numeric",
  "password_too_similar",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

/** First error code per form field; errors without a field are collected under "form". */
export function fieldErrorCodes(body: unknown): Record<string, KnownErrorCode | "other"> {
  const result: Record<string, KnownErrorCode | "other"> = {};
  const errors = (body as AllauthBody | null)?.errors;
  if (!Array.isArray(errors)) return result;
  for (const error of errors) {
    const field = typeof error?.param === "string" && error.param ? error.param : "form";
    if (field in result) continue;
    const code = (KNOWN_ERROR_CODES as readonly string[]).includes(error?.code ?? "")
      ? (error.code as KnownErrorCode)
      : "other";
    result[field] = code;
  }
  return result;
}

/** True if the response says that the given flow (e.g. "verify_email") is pending. */
export function isFlowPending(body: unknown, flowId: string): boolean {
  const flows = (body as AllauthBody | null)?.data?.flows;
  return Array.isArray(flows) && flows.some((flow) => flow?.id === flowId && flow.is_pending === true);
}

/** Keys from email links: allauth keys are URL-safe tokens with ":" separators. */
export function isPlausibleKey(key: string | undefined): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= 512 && /^[A-Za-z0-9:_\-.]+$/.test(key);
}
