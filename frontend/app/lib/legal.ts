/**
 * Legal texts (WP 8.5, ADR 0031): privacy policy, terms of use and imprint as Markdown drafts in
 * `app/legal/`. The operator's personal data never lives in the repository: it comes from the SSR
 * server's environment (`OPERATOR_NAME`, `OPERATOR_ADDRESS`, `CONTACT_EMAIL`) and is filled into
 * the text as plain text. Pure helpers, unit-tested.
 */

export const LEGAL_PAGES = {
  privacy: { title: "Privacy policy", version: "0.1 (draft)", updated: "2026-11-15" },
  terms: { title: "Terms of use", version: "0.1 (draft)", updated: "2026-11-15" },
  imprint: { title: "Imprint", version: "0.1 (draft)", updated: "2026-11-15" },
} as const;

export type LegalSlug = keyof typeof LEGAL_PAGES;

export function isLegalSlug(value: string): value is LegalSlug {
  return Object.hasOwn(LEGAL_PAGES, value);
}

const OPERATOR_SETTINGS = {
  operator_name: "OPERATOR_NAME",
  operator_address: "OPERATOR_ADDRESS",
  contact_email: "CONTACT_EMAIL",
} as const;

type Env = Record<string, string | undefined>;

/** Settings a public deployment must provide (checked when the SSR server starts). */
export function missingOperatorSettings(env: Env): string[] {
  return Object.values(OPERATOR_SETTINGS).filter((name) => !env[name]?.trim());
}

/** Markdown and HTML have no say in configured values: every special character is escaped. */
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>~&"]/g, (c) => `\\${c}`);
}

/**
 * Fills `{{name}}` placeholders. Configured values are escaped; a line break in the address
 * becomes a Markdown line break. Missing values stay visible as "[… – configured on the server]".
 */
export function fillLegalText(text: string, env: Env, platformName: string): string {
  const values: Record<string, string> = { platform: escapeMarkdown(platformName) };
  for (const [key, name] of Object.entries(OPERATOR_SETTINGS)) {
    const raw = env[name]?.trim();
    // Env files carry line breaks as a literal "\n": split first, then escape each line.
    values[key] = raw
      ? raw
          .split(/\r?\n|\\n/)
          .map((line) => escapeMarkdown(line.trim()))
          .filter(Boolean)
          .join("  \n")
      : `\\[${key.replace("_", " ")} – configured on the server\\]`;
  }
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

/** The drafts carry a visible notice until the owner confirms the professional review. */
export function legalTextsReviewed(env: Env): boolean {
  return env.LEGAL_TEXTS_REVIEWED === "true";
}
