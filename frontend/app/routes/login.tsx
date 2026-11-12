import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/login";
import { brand } from "~/config/brand";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Log in · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeRedirectPath(new URL(request.url).searchParams.get("next"), "/account");
  if (await getSessionUser(request)) {
    throw redirect(next, { headers: privateNoStoreHeaders() });
  }
  const csrf = await ensureCsrfToken(request);
  return data(
    { csrfToken: csrf.token, next },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const next = safeRedirectPath(form.get("next"), "/account");

  const result = await backendFetch(request, `${AUTH_BASE}/auth/login`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    },
  });

  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 200) {
    throw redirect(next, { headers });
  }
  // 400 = falsche Zugangsdaten, 403 = CSRF-Prüfung fehlgeschlagen. Keine weiteren Details preisgeben.
  return data(
    { error: result.status === 403 ? "forbidden" : "invalid" },
    { status: result.status === 403 ? 403 : 400, headers },
  );
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("login.title")}</h1>
      {actionData?.error && <p role="alert">{t("login.error")}</p>}
      <Form method="post">
        <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
        <input type="hidden" name="next" value={loaderData.next} />
        <label>
          {t("login.username")}
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          {t("login.password")}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">{t("login.submit")}</button>
      </Form>
    </section>
  );
}
