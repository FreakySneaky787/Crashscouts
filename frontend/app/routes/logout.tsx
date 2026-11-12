import { redirect } from "react-router";

import type { Route } from "./+types/logout";
import { AUTH_BASE, backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

// Abmelden nur per POST mit CSRF-Token – ein GET (z. B. ein eingebettetes Bild) meldet niemanden ab.
export function loader() {
  throw redirect("/", { headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await backendFetch(request, `${AUTH_BASE}/auth/session`, {
    method: "DELETE",
    csrfToken: String(form.get("csrf_token") ?? ""),
  });
  if (result.status === 403) {
    throw new Response("Forbidden", { status: 403, headers: privateNoStoreHeaders() });
  }
  // allauth antwortet nach erfolgreichem Logout mit 401 und löscht das Session-Cookie.
  throw redirect("/", { headers: setCookieHeaders(result.setCookies, privateNoStoreHeaders()) });
}
