/** Confirm the password before changing security settings (allauth requires a fresh confirmation). */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/reauthenticate";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { LockSimpleIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Confirm it's you · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeRedirectPath(new URL(request.url).searchParams.get("next"), "/account");
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(next)}`, { headers: privateNoStoreHeaders() });
  }
  const csrf = await ensureCsrfToken(request);
  return data({ csrfToken: csrf.token, next }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const next = safeRedirectPath(form.get("next"), "/account");
  const result = await backendFetch(request, `${AUTH_BASE}/auth/reauthenticate`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { password: String(form.get("password") ?? "") },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 200) throw redirect(next, { headers });
  const error = result.status === 429 ? "rateLimited" : result.status === 403 ? "forbidden" : "incorrect";
  return data({ error }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function Reauthenticate({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("reauth.title")} subtitle={t("reauth.intro")} />
      <Panel title={t("reauth.panel")}>
        <Form method="post" className={styles.form}>
          {actionData?.error === "incorrect" ? <Notice tone="danger" title={t("reauth.incorrect")} /> : null}
          {actionData?.error === "rateLimited" || actionData?.error === "forbidden" ? (
            <Notice tone="danger" title={t(`formError.${actionData.error}`)} />
          ) : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <input type="hidden" name="next" value={loaderData.next} />
          <TextField id="password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
          <div>
            <Button type="submit" variant="primary" icon={LockSimpleIcon}>
              {t("reauth.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
