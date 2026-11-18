/**
 * Landing page after GitHub: decides where to go next from the session state, or explains an error.
 */
import { useTranslation } from "react-i18next";
import { data, Link, redirect } from "react-router";

import type { Route } from "./+types/provider-callback";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { brand } from "~/config/brand";
import { isFlowPending } from "~/lib/auth";
import { AUTH_BASE, backendFetch } from "~/lib/backend.server";
import { providerErrorKey } from "~/lib/github";
import { privateNoStoreHeaders, safeRedirectPath } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `GitHub · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const headers = privateNoStoreHeaders();
  const error = providerErrorKey(params.get("error"));
  if (error) return data({ error }, { status: 400, headers });

  const session = await backendFetch(request, `${AUTH_BASE}/auth/session`);
  if (session.status === 200) throw redirect(safeRedirectPath(params.get("next"), "/account"), { headers });
  if (isFlowPending(session.data, "provider_signup")) throw redirect("/signup/github", { headers });
  if (isFlowPending(session.data, "verify_email")) throw redirect("/signup/check-email", { headers });
  if (isFlowPending(session.data, "mfa_authenticate")) throw redirect("/login/2fa", { headers });
  return data({ error: "failed" as const }, { status: 400, headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function ProviderCallback({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("github.callbackTitle")} />
      <Notice tone="danger" title={t(`github.error.${loaderData.error}`)}>
        {loaderData.error === "closed" ? t("github.errorTextClosed") : t("github.errorText")}
      </Notice>
      <p className={styles.aside}>
        <Link to="/login">{t("nav.login")}</Link>
      </p>
    </div>
  );
}
