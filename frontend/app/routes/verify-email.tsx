/**
 * Email confirmation from the link in the signup email. Opening the link does NOT confirm the
 * address: email scanners open links automatically, so the user confirms with a button (POST).
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/verify-email";
import { Button } from "~/components/ui/Button";
import { CheckIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { isPlausibleKey } from "~/lib/auth";
import { problemFromStatus } from "~/lib/auth-messages";
import { AUTH_BASE, backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Confirm email · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const csrf = await ensureCsrfToken(request);
  const headers = setCookieHeaders(csrf.setCookies, privateNoStoreHeaders());
  if (!isPlausibleKey(params.key)) {
    return data({ valid: false as const, email: null, csrfToken: csrf.token }, { status: 400, headers });
  }
  const result = await backendFetch<{ data?: { email?: string } }>(request, `${AUTH_BASE}/auth/email/verify`, {
    headers: { "X-Email-Verification-Key": params.key },
  });
  const email = result.data?.data?.email;
  if (result.status !== 200 || !email) {
    return data({ valid: false as const, email: null, csrfToken: csrf.token }, { status: 400, headers });
  }
  return data({ valid: true as const, email, csrfToken: csrf.token }, { headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  if (!isPlausibleKey(params.key)) {
    return data({ invalid: true, problem: null }, { status: 400, headers: privateNoStoreHeaders() });
  }
  const result = await backendFetch(request, `${AUTH_BASE}/auth/email/verify`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { key: params.key },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  // 200 = confirmed and signed in, 401 = confirmed, not signed in (the usual case).
  if (result.status === 200 || result.status === 401) {
    throw redirect("/login?verified=1", { headers });
  }
  if (result.status === 400) {
    return data({ invalid: true, problem: null }, { status: 400, headers });
  }
  return data({ invalid: false, problem: problemFromStatus(result.status) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function VerifyEmail({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  if (!loaderData.valid || actionData?.invalid) {
    return (
      <div className={styles.narrow}>
        <PageHeader title={t("verify.title")} />
        <Notice tone="danger" title={t("verify.invalidTitle")}>
          {t("verify.invalidText")}
        </Notice>
        <p className={styles.aside}>
          <Link to="/signup">{t("nav.signup")}</Link> · <Link to="/login">{t("nav.login")}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("verify.title")} />
      <Panel title={t("verify.panel")}>
        <Form method="post" className={styles.form}>
          {actionData?.problem ? <Notice tone="danger" title={t(`formError.${actionData.problem}`)} /> : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <p>{t("verify.text", { email: loaderData.email })}</p>
          <div>
            <Button type="submit" variant="primary" icon={CheckIcon}>
              {t("verify.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
