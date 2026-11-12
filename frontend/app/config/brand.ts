/**
 * Zentrale Markenangaben. "TestHub" ist ein Arbeitsname (Platzhalter) – der endgültige Name wird
 * vom Projektverantwortlichen festgelegt (docs/OPEN-QUESTIONS.md, K). Nirgends sonst hart codieren.
 */
export const brand = {
  name: import.meta.env.VITE_PLATFORM_NAME ?? "TestHub",
} as const;
