import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/home";
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
    <section>
      <h1>{t("home.title")}</h1>
      <p>{t("home.intro")}</p>
    </section>
  );
}
