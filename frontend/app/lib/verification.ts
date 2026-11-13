/** Repository verification (WP 2.5): types and pure helpers; unit-tested. */

export type VerificationStatus = {
  repository_url: string;
  host: "github" | "gitlab" | "codeberg" | null;
  verified: boolean;
  method: "file" | "github" | null;
  verified_at: string | null;
  filename: string;
  code: string | null;
  github_available: boolean;
};

/** Error codes the backend reports; anything else is shown as a generic failure. */
export const VERIFICATION_ERRORS = [
  "unsupported_repository",
  "not_public",
  "file_missing",
  "code_mismatch",
  "response_too_large",
  "repository_moved",
  "repository_changed",
  "host_unavailable",
  "not_github",
  "not_maintainer",
  "github_unavailable",
  "github_failed",
  "invalid_state",
  "cancelled",
  "rate_limited",
] as const;
export type VerificationError = (typeof VERIFICATION_ERRORS)[number] | "generic";

export function verificationErrorKey(code: unknown): VerificationError {
  return typeof code === "string" && (VERIFICATION_ERRORS as readonly string[]).includes(code) ? (code as VerificationError) : "generic";
}

/** Result of a check, carried in the edit page's URL after a redirect (e.g. from GitHub). */
export function verificationOutcome(params: URLSearchParams): { ok: true } | { ok: false; error: VerificationError } | null {
  if (params.get("verification") === "verified") return { ok: true };
  const error = params.get("verification_error");
  return error === null ? null : { ok: false, error: verificationErrorKey(error) };
}

export const HOST_NAMES = { github: "GitHub", gitlab: "GitLab", codeberg: "Codeberg" } as const;
