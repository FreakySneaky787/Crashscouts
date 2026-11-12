import type { TFunction } from "i18next";

import type { KnownErrorCode } from "./auth";

/** Turns an error code from fieldErrorCodes() into a translated message for one field. */
export function fieldErrorMessage(t: TFunction, field: string, code: KnownErrorCode | "other" | undefined): string | undefined {
  if (!code) return undefined;
  if (field === "age_confirmed" && code === "required") return t("formError.age_required");
  return t(`formError.${code}`);
}

/** Form-level problems from HTTP status codes that have no field. */
export type FormProblem = "forbidden" | "rateLimited" | "generic";

export function problemFromStatus(status: number): FormProblem {
  if (status === 403) return "forbidden";
  if (status === 429) return "rateLimited";
  return "generic";
}
