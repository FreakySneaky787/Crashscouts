import { redirect } from "react-router";

import type { Route } from "./+types/logout";
import { AUTH_BASE, backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

// Logout only via POST with a CSRF token – a GET (e.g. an embedded image) never logs anyone out.
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
  // After a successful logout allauth answers 401 and clears the session cookie.
  throw redirect("/", { headers: setCookieHeaders(result.setCookies, privateNoStoreHeaders()) });
}
