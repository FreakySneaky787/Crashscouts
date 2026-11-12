/**
 * Resource route: downloads the personal data export (WP 1.5). A plain form POST (no JavaScript
 * needed); the password is checked by Django. Errors go back to the settings page.
 */
import { redirect } from "react-router";

import type { Route } from "./+types/account-export";
import { backendFetch } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";

export function loader() {
  throw redirect("/settings/account", { headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await backendFetch<Record<string, unknown>>(request, "/api/v1/me/export/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { password: String(form.get("password") ?? "") },
  });
  if (result.status === 200 && result.data) {
    const headers = privateNoStoreHeaders();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="personal-data-${new Date().toISOString().slice(0, 10)}.json"`);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(JSON.stringify(result.data, null, 2), { status: 200, headers });
  }
  const codes = (result.data?.password as string[] | undefined) ?? [];
  const reason = result.status === 429 ? "rateLimited" : codes.includes("no_password") ? "noPassword" : result.status === 400 ? "wrongPassword" : "generic";
  throw redirect(`/settings/account?export=${reason}`, { headers: privateNoStoreHeaders() });
}
