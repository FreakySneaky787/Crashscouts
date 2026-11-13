/** Sends the team's appeal against a block (WP 3B.3) and returns to the page it came from. */
import { data, redirect } from "react-router";

import type { Route } from "./+types/block-appeal";
import { backendFetch } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, safeRedirectPath } from "~/lib/http";

export function loader() {
  throw redirect("/account", { headers: privateNoStoreHeaders() });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!isUuid(params.id)) throw data(null, { status: 404 });
  const form = await request.formData();
  const back = safeRedirectPath(String(form.get("back") ?? ""), "/account");
  const result = await backendFetch<{ code?: string }>(request, `/api/v1/blocks/${params.id}/appeal/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { text: String(form.get("text") ?? "") },
  });
  const outcome = result.status === 204 ? "sent" : (result.data?.code ?? "failed");
  const separator = back.includes("?") ? "&" : "?";
  throw redirect(`${back}${separator}appeal=${encodeURIComponent(outcome)}`, { headers: privateNoStoreHeaders() });
}
