/** Shapes of allauth's authenticator API and small pure helpers (unit-tested). */

export type Authenticator = {
  type: "totp" | "recovery_codes" | "webauthn";
  created_at: number;
  last_used_at: number | null;
  total_code_count?: number;
  unused_code_count?: number;
  id?: number;
  name?: string;
  is_passwordless?: boolean;
};

/** "ABCDEFGH…" → "ABCD EFGH …" for typing the key into an authenticator app by hand. */
export function groupSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(" ");
}
