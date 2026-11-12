// Typsichere Übersetzungsschlüssel: ein falscher oder fehlender Schlüssel ist ein TypeScript-Fehler.
import "i18next";

import type { defaultNamespace, resources } from "./index";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    resources: (typeof resources)["en"];
  }
}
