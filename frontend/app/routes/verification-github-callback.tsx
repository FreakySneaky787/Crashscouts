/**
 * GitHub sends the browser here after the one-time authorization for the repository verification
 * (WP 2.5; second callback URL of the GitHub OAuth app). The query goes to the backend, which
 * checks the signed state against the session, exchanges the code, checks the permissions and
 * revokes the token at once. The browser then returns to the project's edit page.
 */
import { data, redirect } from "react-router";

import type { Route } from "./+types/verification-github-callback";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug } from "~/lib/projects";
import { verificationErrorKey } from "~/lib/verification";

export async function loader({ request }: Route.LoaderArgs) {
  const headers = privateNoStoreHeaders();
  if (!(await getSessionUser(request))) throw redirect("/login", { headers });
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  if (!state) throw data(null, { status: 404, headers });
  // Only the three OAuth parameters are passed on; the signed state protects this GET.
  const query = new URLSearchParams({ state, code: params.get("code") ?? "", error: params.get("error") ?? "" });
  const result = await backendFetch<{ slug?: string; code?: string }>(request, `/api/v1/repository-verification/github/callback/?${query}`);
  const responseHeaders = setCookieHeaders(result.setCookies, headers);
  const slug = result.data?.slug;
  if (!isValidProjectSlug(slug)) throw redirect(`/account?verification_error=${verificationErrorKey(result.data?.code)}`, { headers: responseHeaders });
  if (result.status === 200) throw redirect(`/p/${slug}/edit?verification=verified`, { headers: responseHeaders });
  throw redirect(`/p/${slug}/edit?verification_error=${verificationErrorKey(result.data?.code)}`, { headers: responseHeaders });
}
