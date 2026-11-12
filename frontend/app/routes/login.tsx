import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/login";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { SignInIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { isFlowPending } from "~/lib/auth";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Log in · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const next = safeRedirectPath(params.get("next"), "/account");
  // Fixed notices after email confirmation or password reset; no free text from the URL.
  const notice: "verified" | "resetDone" | null =
    params.get("verified") === "1" ? "verified" : params.get("reset") === "1" ? "resetDone" : null;
  if (await getSessionUser(request)) {
    throw redirect(next, { headers: privateNoStoreHeaders() });
  }
  const csrf = await ensureCsrfToken(request);
  return data(
    { csrfToken: csrf.token, next, notice },
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
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    },
  });

  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 200) {
    throw redirect(next, { headers });
  }
  // Correct password, but the email address is not confirmed yet.
  if (result.status === 401 && isFlowPending(result.data, "verify_email")) {
    return data({ error: "unverified" as const }, { status: 400, headers });
  }
  // 400 = wrong credentials, 403 = CSRF check failed, 429 = rate limit. No further details.
  const error = result.status === 403 ? "forbidden" : result.status === 429 ? "rateLimited" : "invalid";
  return data({ error }, { status: result.status === 403 ? 403 : result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("login.title")} />
      <Panel title={t("login.panel")}>
        <Form method="post" className={styles.form}>
          {loaderData.notice && !actionData ? <Notice tone="ok" title={t(`login.${loaderData.notice}`)} /> : null}
          {actionData?.error === "invalid" ? <Notice tone="danger" title={t("login.error")} /> : null}
          {actionData?.error === "unverified" ? <Notice tone="danger" title={t("login.unverified")} /> : null}
          {actionData?.error === "forbidden" || actionData?.error === "rateLimited" ? (
            <Notice tone="danger" title={t(`formError.${actionData.error}`)} />
          ) : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <input type="hidden" name="next" value={loaderData.next} />
          <TextField id="email" name="email" type="email" label={t("login.email")} autoComplete="email" required />
          <TextField id="password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
          <div>
            <Button type="submit" variant="primary" icon={SignInIcon}>
              {t("login.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
      <p className={styles.aside}>
        <Link to="/password/forgot">{t("login.forgot")}</Link>
      </p>
      <p className={styles.aside}>
        {t("login.noAccount")} <Link to="/signup">{t("login.createAccount")}</Link>
      </p>
    </div>
  );
}
