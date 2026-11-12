/**
 * Central brand settings. "TestHub" is a working name (placeholder) – the final name is decided by
 * the project owner (docs/OPEN-QUESTIONS.md, K). Never hard-code it anywhere else.
 */
export const brand = {
  name: import.meta.env.VITE_PLATFORM_NAME ?? "TestHub",
} as const;
