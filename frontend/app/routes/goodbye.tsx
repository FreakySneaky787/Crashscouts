import { useTranslation } from "react-i18next";
import { data, Link } from "react-router";

import type { Route } from "./+types/goodbye";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { brand } from "~/config/brand";
import { privateNoStoreHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Account deletion · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export function loader() {
  return data(null, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Goodbye() {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("goodbye.title")} />
      <Notice tone="info" title={t("goodbye.scheduled")}>
        {t("goodbye.text")}
      </Notice>
      <p className={styles.aside}>
        <Link to="/login">{t("goodbye.changedMind")}</Link>
      </p>
    </div>
  );
}
