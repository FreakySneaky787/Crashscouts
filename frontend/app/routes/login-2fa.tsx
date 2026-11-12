/** Second login step for accounts with two-factor authentication: authenticator or recovery code. */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/login-2fa";
import { PasskeySignIn } from "~/components/auth/Passkeys";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { ShieldCheckIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { isFlowPending } from "~/lib/auth";
import { AUTH_BASE, backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Two-factor check · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeRedirectPath(new URL(request.url).searchParams.get("next"), "/account");
  // Only reachable while a login is waiting for its second factor.
  const session = await backendFetch(request, `${AUTH_BASE}/auth/session`);
  if (!(session.status === 401 && isFlowPending(session.data, "mfa_authenticate"))) {
    throw redirect(session.status === 200 ? next : "/login", { headers: privateNoStoreHeaders() });
  }
  // Which second factors this account has (e.g. "totp", "recovery_codes", "webauthn").
  const flows = (session.data as { data?: { flows?: { id?: string; types?: string[] }[] } } | null)?.data?.flows ?? [];
  const types = flows.find((flow) => flow.id === "mfa_authenticate")?.types ?? [];
  const csrf = await ensureCsrfToken(request);
  return data(
    { csrfToken: csrf.token, next, passkey: types.includes("webauthn"), code: types.some((type) => type !== "webauthn") },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const next = safeRedirectPath(form.get("next"), "/account");
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  const result = await backendFetch(request, `${AUTH_BASE}/auth/2fa/authenticate`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { code },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 200) throw redirect(next, { headers });
  // The pending login expired (or was never there): start again.
  if (result.status === 401 && !isFlowPending(result.data, "mfa_authenticate")) throw redirect("/login", { headers });
  const error = result.status === 429 ? "rateLimited" : result.status === 403 ? "forbidden" : "incorrect";
  return data({ error }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function LoginTwoFactor({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("mfa.loginTitle")} subtitle={t("mfa.loginIntro")} />
      {loaderData.passkey ? (
        <Panel title={t("passkeys.secondPanel")}>
          <PasskeySignIn mode="2fa" csrfToken={loaderData.csrfToken} next={loaderData.next} />
        </Panel>
      ) : null}
      {loaderData.code ? (
      <Panel title={t("mfa.codePanel")}>
        <Form method="post" className={styles.form}>
          {actionData?.error === "incorrect" ? <Notice tone="danger" title={t("mfa.incorrect")} /> : null}
          {actionData?.error === "rateLimited" || actionData?.error === "forbidden" ? (
            <Notice tone="danger" title={t(`formError.${actionData.error}`)} />
          ) : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <input type="hidden" name="next" value={loaderData.next} />
          <TextField
            id="code"
            name="code"
            label={t("mfa.code")}
            hint={t("mfa.codeHint")}
            autoComplete="one-time-code"
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <div>
            <Button type="submit" variant="primary" icon={ShieldCheckIcon}>
              {t("mfa.verify")}
            </Button>
          </div>
        </Form>
      </Panel>
      ) : null}
      <p className={styles.aside}>
        <Link to="/login">{t("mfa.startOver")}</Link>
      </p>
    </div>
  );
}
