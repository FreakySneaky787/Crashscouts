/**
 * GitHub sends the browser here (the callback URL registered at GitHub). Forwarded with query and
 * cookies to allauth, which checks the OAuth state, talks to GitHub and redirects to our
 * /login/provider/callback page. In production the reverse proxy may route this path to Django
 * directly; both lead to the same result.
 */
import { redirect } from "react-router";

import type { Route } from "./+types/github-callback";
import { backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const result = await backendFetch(request, `/accounts/github/login/callback/${url.search}`);
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  // allauth answers with a relative redirect to the frontend; never follow anything else.
  const target = safeRedirectPath(result.location, "/login/provider/callback?error=unknown");
  throw redirect(target, { headers });
}
