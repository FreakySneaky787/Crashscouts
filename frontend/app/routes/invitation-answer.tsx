/** Accept or decline an invitation (form POST from the account page). */
import { data, redirect } from "react-router";

import type { Route } from "./+types/invitation-answer";
import { backendFetch } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders } from "~/lib/http";

export function loader() {
  throw redirect("/account", { headers: privateNoStoreHeaders() });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!isUuid(params.id) || (params.answer !== "accept" && params.answer !== "decline")) throw data(null, { status: 404 });
  const form = await request.formData();
  const result = await backendFetch(request, `/api/v1/me/invitations/${params.id}/${params.answer}/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
  });
  const outcome = result.status === 204 ? (params.answer === "accept" ? "accepted" : "declined") : "gone";
  throw redirect(`/account?invitation=${outcome}`, { headers: privateNoStoreHeaders() });
}
