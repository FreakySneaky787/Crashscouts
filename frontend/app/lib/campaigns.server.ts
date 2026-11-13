/** Server-only data for the campaign forms (platforms, time zones, CSRF token). */
import { data } from "react-router";

import { backendFetch, ensureCsrfToken } from "./backend.server";
import { timeZones } from "./campaigns";
import { privateNoStoreHeaders } from "./http";
import type { Catalog } from "./profile";

export async function loadCampaignFormData(request: Request) {
  const [catalog, csrf] = await Promise.all([backendFetch<Catalog>(request, "/api/v1/catalog/"), ensureCsrfToken(request)]);
  if (!catalog.data) throw data(null, { status: 502, headers: privateNoStoreHeaders() });
  // Rendered by the server so the list is identical for every browser.
  return { platforms: catalog.data.platforms, timeZones: timeZones(), csrf };
}
