import { data, redirect } from "react-router";

import type { Route } from "./+types/theme";
import { privateNoStoreHeaders, safeRedirectPath } from "~/lib/http";
import { isTheme, themeCookie } from "~/lib/theme";

// Only POST changes the theme; a GET (e.g. a link or image) never does.
export function loader() {
  throw redirect("/", { headers: privateNoStoreHeaders() });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const theme = form.get("theme");
  if (!isTheme(theme)) {
    return data({ ok: false as const }, { status: 400, headers: privateNoStoreHeaders() });
  }

  const headers = privateNoStoreHeaders();
  headers.append("Set-Cookie", themeCookie(theme, new URL(request.url).protocol === "https:"));

  // With JavaScript the switch posts via a fetcher and updates in place; without it we redirect back.
  if (form.get("_js") === "1") {
    return data({ ok: true as const, theme }, { headers });
  }
  throw redirect(safeRedirectPath(form.get("redirectTo"), "/"), { headers });
}
