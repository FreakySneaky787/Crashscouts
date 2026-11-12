// Type-safe translation keys: a wrong or missing key is a TypeScript error.
import "i18next";

import type { defaultNamespace, resources } from "./index";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    resources: (typeof resources)["en"];
  }
}
