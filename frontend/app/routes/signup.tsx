import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/signup";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextField } from "~/components/ui/Form";
import { UserPlusIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { fieldErrorCodes, isFlowPending } from "~/lib/auth";
import { fieldErrorMessage, problemFromStatus, type FormProblem } from "~/lib/auth-messages";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Sign up · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getSessionUser(request)) {
    throw redirect("/account", { headers: privateNoStoreHeaders() });
  }
  const config = await backendFetch<{ data?: { account?: { is_open_for_signup?: boolean } } }>(
    request,
    `${AUTH_BASE}/config`,
  );
  const open = config.data?.data?.account?.is_open_for_signup === true;
  const csrf = await ensureCsrfToken(request);
  return data({ csrfToken: csrf.token, open }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  // Typed values are echoed back on errors – except the password.
  const values = { email: String(form.get("email") ?? ""), username: String(form.get("username") ?? "") };

  const result = await backendFetch(request, `${AUTH_BASE}/auth/signup`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: {
      ...values,
      password: String(form.get("password") ?? ""),
      age_confirmed: form.get("age_confirmed") === "on",
    },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());

  // Success and "address already registered" look identical (no account enumeration).
  if (result.status === 401 && isFlowPending(result.data, "verify_email")) {
    throw redirect("/signup/check-email", { headers });
  }
  if (result.status === 400) {
    return data({ values, errors: fieldErrorCodes(result.data), problem: null }, { status: 400, headers });
  }
  const problem: FormProblem = problemFromStatus(result.status);
  return data({ values, errors: {}, problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function Signup({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const error = (field: string) => fieldErrorMessage(t, field, errors[field] as never);

  if (!loaderData.open) {
    return (
      <div className={styles.narrow}>
        <PageHeader title={t("signup.title")} />
        <Notice tone="info" title={t("signup.closed")}>
          {t("signup.closedText")}
        </Notice>
      </div>
    );
  }

  return (
    <div className={styles.narrow}>
      <PageHeader title={t("signup.title")} subtitle={t("signup.intro")} />
      <Panel title={t("signup.panel")}>
        <Form method="post" className={styles.form} noValidate>
          {actionData?.problem ? <Notice tone="danger" title={t(`formError.${actionData.problem}`)} /> : null}
          {errors.form ? <Notice tone="danger" title={error("form")} /> : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <TextField
            id="email"
            name="email"
            type="email"
            label={t("signup.email")}
            hint={t("signup.emailHint")}
            autoComplete="email"
            defaultValue={actionData?.values.email}
            error={error("email")}
            required
          />
          <TextField
            id="username"
            name="username"
            label={t("signup.username")}
            hint={t("signup.usernameHint")}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={30}
            defaultValue={actionData?.values.username}
            error={error("username")}
            required
          />
          <TextField
            id="password"
            name="password"
            type="password"
            label={t("signup.password")}
            hint={t("signup.passwordHint")}
            autoComplete="new-password"
            minLength={12}
            error={error("password")}
            required
          />
          <CheckboxField id="age_confirmed" name="age_confirmed" label={t("signup.age")} error={error("age_confirmed")} required />
          <div>
            <Button type="submit" variant="primary" icon={UserPlusIcon}>
              {t("signup.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
      <p className={styles.aside}>
        {t("signup.haveAccount")} <Link to="/login">{t("signup.login")}</Link>
      </p>
    </div>
  );
}
