/**
 * Starts the GitHub login or the linking of GitHub to the signed-in account (WP 1.4).
 * A plain form POST (works without JavaScript): forwarded to allauth, which stores the OAuth state
 * in the session and answers with a redirect to GitHub. Only GitHub's authorization page is
 * followed; anything else ends on the callback page with an error.
 */
import { redirect } from "react-router";

import type { Route } from "./+types/auth-github";
import { AUTH_BASE, backendFetch } from "~/lib/backend.server";
import { isGitHubAuthorizeUrl } from "~/lib/github";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

export function loader() {
  throw redirect("/login", { headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const connect = form.get("process") === "connect";
  const upstream = new FormData();
  upstream.set("provider", "github");
  upstream.set("process", connect ? "connect" : "login");
  // Relative: allauth sends the browser back to this path on the public host.
  upstream.set("callback_url", connect ? "/login/provider/callback?next=%2Fsettings%2Fsecurity" : "/login/provider/callback");

  const result = await backendFetch(request, `${AUTH_BASE}/auth/provider/redirect`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    form: upstream,
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 302 && isGitHubAuthorizeUrl(result.location)) {
    throw redirect(result.location, { headers });
  }
  throw redirect("/login/provider/callback?error=unknown", { headers });
}
