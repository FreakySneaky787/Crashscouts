import { useTranslation } from "react-i18next";
import { data, Link } from "react-router";

import type { Route } from "./+types/home";
import { EmptyState } from "~/components/ui/EmptyState";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { cacheHeadersFor } from "~/lib/http";

export function meta(_: Route.MetaArgs) {
  return [
    { title: brand.name },
    { name: "description", content: `${brand.name} – early development build.` },
  ];
}

export function loader({ request }: Route.LoaderArgs) {
  return data(null, { headers: cacheHeadersFor(request) });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Home() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("home.title")} subtitle={t("home.intro")} />
      <Panel title={t("home.activity")}>
        <EmptyState kind="first-use" title={t("home.emptyTitle")} action={<Link to="/discover">{t("home.emptyAction")}</Link>}>
          {t("home.emptyText")}
        </EmptyState>
      </Panel>
    </>
  );
}
