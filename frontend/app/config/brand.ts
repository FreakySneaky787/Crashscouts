/**
 * Central brand settings. The name "Crashscouts" was decided by the project owner on 2026-11-15
 * (docs/OPEN-QUESTIONS.md, K; domain crashscouts.org). Never hard-code it anywhere else.
 */
export const brand = {
  name: import.meta.env.VITE_PLATFORM_NAME ?? "Crashscouts",
} as const;
