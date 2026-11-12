import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/probe-public";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { cacheHeadersFor, isUuid, privateNoStoreHeaders } from "~/lib/http";

type ProbeItem = { id: string; title: string; description: string; touch_count: number };

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!isUuid(params.id)) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  const result = await backendFetch<ProbeItem>(request, `/api/v1/probe/items/${params.id}/`);
  if (result.status !== 200 || !result.data) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  // Anonym: öffentlich cachebar. Mit Session: privat. Backend-Cookies werden hier NIE weitergegeben.
  return data(result.data, { headers: cacheHeadersFor(request) });
}

export function headers({ loaderHeaders, errorHeaders }: Route.HeadersArgs) {
  return errorHeaders ?? loaderHeaders;
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: brand.name }];
  const title = `${loaderData.title} · ${brand.name}`;
  return [
    { title },
    { name: "description", content: loaderData.description },
    { property: "og:title", content: title },
    { property: "og:description", content: loaderData.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: brand.name },
  ];
}

export default function ProbePublic({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <article>
      <p>{t("probe.public")}</p>
      <h1>{loaderData.title}</h1>
      <p>{loaderData.description}</p>
    </article>
  );
}
