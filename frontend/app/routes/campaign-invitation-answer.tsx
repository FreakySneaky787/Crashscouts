/** Accept or decline a campaign invitation (form POST from the account page, WP 3A.5). */
import { data, redirect } from "react-router";

import type { Route } from "./+types/campaign-invitation-answer";
import { backendFetch } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders } from "~/lib/http";

export function loader() {
  throw redirect("/account", { headers: privateNoStoreHeaders() });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!isUuid(params.id) || (params.answer !== "accept" && params.answer !== "decline")) throw data(null, { status: 404 });
  const form = await request.formData();
  const result = await backendFetch<{ code?: string }>(request, `/api/v1/me/campaign-invitations/${params.id}/${params.answer}/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
  });
  const code = result.data?.code;
  const outcome =
    result.status === 204 ? (params.answer === "accept" ? "joined" : "declined") : code === "campaign_full" ? "full" : code === "campaign_closed" ? "closed" : "gone";
  throw redirect(`/account?campaign_invitation=${outcome}`, { headers: privateNoStoreHeaders() });
}
