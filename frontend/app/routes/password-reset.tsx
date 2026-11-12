import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/password-reset";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { KeyIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { fieldErrorCodes, isPlausibleKey } from "~/lib/auth";
import { fieldErrorMessage, problemFromStatus } from "~/lib/auth-messages";
import { AUTH_BASE, backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `New password · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const csrf = await ensureCsrfToken(request);
  const headers = setCookieHeaders(csrf.setCookies, privateNoStoreHeaders());
  let valid = false;
  if (isPlausibleKey(params.key)) {
    const result = await backendFetch(request, `${AUTH_BASE}/auth/password/reset`, {
      headers: { "X-Password-Reset-Key": params.key },
    });
    valid = result.status === 200;
  }
  return data({ valid, csrfToken: csrf.token }, { status: valid ? 200 : 400, headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  if (!isPlausibleKey(params.key)) {
    return data({ invalid: true, errors: {}, problem: null }, { status: 400, headers: privateNoStoreHeaders() });
  }
  const result = await backendFetch(request, `${AUTH_BASE}/auth/password/reset`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { key: params.key, password: String(form.get("password") ?? "") },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  // 200 = reset and signed in, 401 = reset, not signed in (ACCOUNT_LOGIN_ON_PASSWORD_RESET=False).
  if (result.status === 200 || result.status === 401) {
    throw redirect("/login?reset=1", { headers });
  }
  if (result.status === 400) {
    const errors = fieldErrorCodes(result.data);
    return data({ invalid: "key" in errors, errors, problem: null }, { status: 400, headers });
  }
  return data({ invalid: false, errors: {}, problem: problemFromStatus(result.status) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function PasswordReset({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};

  if (!loaderData.valid || actionData?.invalid) {
    return (
      <div className={styles.narrow}>
        <PageHeader title={t("reset.title")} />
        <Notice tone="danger" title={t("reset.invalidTitle")}>
          {t("reset.invalidText")}
        </Notice>
        <p className={styles.aside}>
          <Link to="/password/forgot">{t("reset.requestNew")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.narrow}>
      <PageHeader title={t("reset.title")} />
      <Panel title={t("reset.panel")}>
        <Form method="post" className={styles.form} noValidate>
          {actionData?.problem ? <Notice tone="danger" title={t(`formError.${actionData.problem}`)} /> : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <TextField
            id="password"
            name="password"
            type="password"
            label={t("reset.password")}
            hint={t("signup.passwordHint")}
            autoComplete="new-password"
            minLength={12}
            error={fieldErrorMessage(t, "password", errors.password as never)}
            required
          />
          <div>
            <Button type="submit" variant="primary" icon={KeyIcon}>
              {t("reset.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
