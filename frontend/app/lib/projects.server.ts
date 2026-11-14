/** Server-only data for the project forms (catalogs, licences, CSRF token). */
import { data } from "react-router";

import { backendFetch, ensureCsrfToken } from "./backend.server";
import { privateNoStoreHeaders } from "./http";
import type { Catalog } from "./profile";
import type { License } from "./projects";

type FullCatalog = Catalog & { languages: { slug: string; name: string }[]; software_types: { slug: string; name: string }[] };

export async function loadFormData(request: Request) {
  const [catalog, licenses, csrf] = await Promise.all([
    backendFetch<FullCatalog>(request, "/api/v1/catalog/"),
    backendFetch<License[]>(request, "/api/v1/catalog/licenses/"),
    ensureCsrfToken(request),
  ]);
  if (!catalog.data || !licenses.data) throw data(null, { status: 502, headers: privateNoStoreHeaders() });
  return { catalog: catalog.data, licenses: licenses.data, csrf };
}
