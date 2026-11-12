/**
 * Completing a signup that started with GitHub: username and the 16+ confirmation are required
 * like in the normal signup (owner's decision). The email address GitHub reported is prefilled.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/signup-github";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextField } from "~/components/ui/Form";
import { UserPlusIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { fieldErrorCodes, isFlowPending } from "~/lib/auth";
import { fieldErrorMessage, problemFromStatus } from "~/lib/auth-messages";
import { AUTH_BASE, backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { suggestUsername } from "~/lib/github";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

type PendingSignup = {
  data?: { email?: { email: string; primary?: boolean; verified?: boolean }[]; account?: { display?: string } };
};

export function meta(_: Route.MetaArgs) {
  return [{ title: `Sign up with GitHub · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const pending = await backendFetch<PendingSignup>(request, `${AUTH_BASE}/auth/provider/signup`);
  if (pending.status !== 200) throw redirect("/login", { headers: privateNoStoreHeaders() });
  const emails = pending.data?.data?.email ?? [];
  const email = (emails.find((e) => e.primary) ?? emails[0])?.email ?? "";
  const csrf = await ensureCsrfToken(request);
  return data(
    { csrfToken: csrf.token, email, username: suggestUsername(pending.data?.data?.account?.display) },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values = { email: String(form.get("email") ?? ""), username: String(form.get("username") ?? "") };
  const result = await backendFetch(request, `${AUTH_BASE}/auth/provider/signup`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { ...values, age_confirmed: form.get("age_confirmed") === "on" },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 200) throw redirect("/account", { headers });
  if (result.status === 401 && isFlowPending(result.data, "verify_email")) throw redirect("/signup/check-email", { headers });
  if (result.status === 400) {
    return data({ values, errors: fieldErrorCodes(result.data), problem: null }, { status: 400, headers });
  }
  // 409: no pending GitHub signup (expired or already completed).
  if (result.status === 409) throw redirect("/login", { headers });
  return data({ values, errors: {}, problem: problemFromStatus(result.status) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function SignupGitHub({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};
  const error = (field: string) => fieldErrorMessage(t, field, errors[field] as never);
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("github.signupTitle")} subtitle={t("github.signupIntro")} />
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
            hint={t("github.emailHint")}
            autoComplete="email"
            defaultValue={actionData?.values.email ?? loaderData.email}
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
            defaultValue={actionData?.values.username ?? loaderData.username}
            error={error("username")}
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
    </div>
  );
}
