import { useTranslation } from "react-i18next";
import { data, Form, Link } from "react-router";

import type { Route } from "./+types/password-forgot";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { EnvelopeSimpleIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { fieldErrorCodes } from "~/lib/auth";
import { fieldErrorMessage, problemFromStatus } from "~/lib/auth-messages";
import { AUTH_BASE, backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Reset password · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const csrf = await ensureCsrfToken(request);
  return data({ csrfToken: csrf.token }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const result = await backendFetch(request, `${AUTH_BASE}/auth/password/request`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { email },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  // Same answer whether or not an account exists (no account enumeration).
  if (result.status === 200) {
    return data({ sent: true, email: "", errors: {}, problem: null }, { headers });
  }
  if (result.status === 400) {
    return data({ sent: false, email, errors: fieldErrorCodes(result.data), problem: null }, { status: 400, headers });
  }
  return data(
    { sent: false, email, errors: {}, problem: problemFromStatus(result.status) },
    { status: result.status === 429 ? 429 : 400, headers },
  );
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function PasswordForgot({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const errors: Record<string, string | undefined> = actionData?.errors ?? {};

  if (actionData?.sent) {
    return (
      <div className={styles.narrow}>
        <PageHeader title={t("forgot.title")} />
        <Notice tone="ok" title={t("forgot.sentTitle")}>
          {t("forgot.sentText")}
        </Notice>
        <p className={styles.aside}>
          <Link to="/login">{t("nav.login")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.narrow}>
      <PageHeader title={t("forgot.title")} />
      <Panel title={t("forgot.panel")}>
        <Form method="post" className={styles.form} noValidate>
          {actionData?.problem ? <Notice tone="danger" title={t(`formError.${actionData.problem}`)} /> : null}
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <p>{t("forgot.text")}</p>
          <TextField
            id="email"
            name="email"
            type="email"
            label={t("forgot.email")}
            autoComplete="email"
            defaultValue={actionData?.email}
            error={fieldErrorMessage(t, "email", errors.email as never)}
            required
          />
          <div>
            <Button type="submit" variant="primary" icon={EnvelopeSimpleIcon}>
              {t("forgot.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
