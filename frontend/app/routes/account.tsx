import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/account";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Avatar } from "~/components/ui/Data";
import { EyeIcon, PencilSimpleIcon, SignOutIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Account · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login?next=/account", { headers: privateNoStoreHeaders() });
  }
  const csrf = await ensureCsrfToken(request);
  return data(
    { username: user.username, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader
        title={t("account.title")}
        leading={<Avatar name={loaderData.username} id={loaderData.username} size="lg" />}
        subtitle={<span data-testid="signed-in-as">{t("account.signedInAs", { username: loaderData.username })}</span>}
      />
      <Panel title={t("account.profile")}>
        <div className={styles.stack}>
          <p>{t("account.profileText")}</p>
          <div className={styles.buttonRow}>
            <ButtonLink to="/settings/profile" icon={PencilSimpleIcon}>
              {t("account.editProfile")}
            </ButtonLink>
            <ButtonLink to={`/u/${loaderData.username}`} variant="quiet" icon={EyeIcon}>
              {t("settings.viewPublic")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      <Panel title={t("account.session")}>
        <p>{t("account.sessionText")}</p>
        <Form method="post" action="/logout">
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <Button type="submit" icon={SignOutIcon}>
            {t("nav.logout")}
          </Button>
        </Form>
      </Panel>
    </div>
  );
}
