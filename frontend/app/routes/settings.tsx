/**
 * Settings overview (owner's request 2026-11-18): one place that leads to all settings of the
 * signed-in account. The sidebar's "Settings" link points here and stays active on every
 * /settings/... page.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/settings";
import { ButtonLink } from "~/components/ui/Button";
import { DatabaseIcon, EyeIcon, PencilSimpleIcon, ShieldCheckIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Settings · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) throw redirect("/login?next=/settings", { headers: privateNoStoreHeaders() });
  return data({ username: user.username }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.settings")} />
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
      <Panel title={t("account.security")}>
        <div className={styles.stack}>
          <p>{t("account.securityText")}</p>
          <div>
            <ButtonLink to="/settings/security" icon={ShieldCheckIcon}>
              {t("account.editSecurity")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      <Panel title={t("account.data")}>
        <div className={styles.stack}>
          <p>{t("account.dataText")}</p>
          <div>
            <ButtonLink to="/settings/account" icon={DatabaseIcon}>
              {t("account.editData")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </>
  );
}
