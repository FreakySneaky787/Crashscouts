import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/login";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { SignInIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, safeRedirectPath, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

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
  // 400 = wrong credentials, 403 = CSRF check failed. Reveal no further details.
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
    <div className={styles.narrow}>
      <PageHeader title={t("login.title")} />
      <Panel title={t("login.panel")}>
        {actionData?.error ? (
          <p role="alert" className={styles.alert}>
            {t("login.error")}
          </p>
        ) : null}
        <Form method="post" className={styles.form}>
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <input type="hidden" name="next" value={loaderData.next} />
          <TextField id="username" name="username" label={t("login.username")} autoComplete="username" required />
          <TextField id="password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
          <div>
            <Button type="submit" variant="primary" icon={SignInIcon}>
              {t("login.submit")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
