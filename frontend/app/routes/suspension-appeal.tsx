/** Sends the suspended person's single appeal (WP 7.2) and returns to the account page. */
import { redirect } from "react-router";

import type { Route } from "./+types/suspension-appeal";
import { backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";

export function loader() {
  throw redirect("/account", { headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await backendFetch<{ code?: string }>(request, "/api/v1/me/suspension/appeal/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { text: String(form.get("text") ?? "") },
  });
  const outcome = result.status === 204 ? "sent" : "failed";
  throw redirect(`/account?suspension_appeal=${outcome}#suspension`, { headers: privateNoStoreHeaders() });
}
