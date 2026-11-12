import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/signup-check-email";
import { EnvelopeSimpleIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { privateNoStoreHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Check your inbox · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export function loader() {
  return data(null, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function SignupCheckEmail() {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("signup.checkTitle")} leading={<EnvelopeSimpleIcon aria-hidden="true" className={styles.leadIcon} />} />
      <Panel title={t("signup.panel")}>
        <div className={styles.stack}>
          <p>{t("signup.checkText")}</p>
          <p className={styles.muted}>{t("signup.checkHint")}</p>
        </div>
      </Panel>
    </div>
  );
}
