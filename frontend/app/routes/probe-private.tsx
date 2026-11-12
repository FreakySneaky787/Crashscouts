import { useTranslation } from "react-i18next";
import { data, Form } from "react-router";

import type { Route } from "./+types/probe-private";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

type ProbeItem = { id: string; title: string; description: string; touch_count: number };

function notFound(): never {
  throw data(null, { status: 404, headers: privateNoStoreHeaders() });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!isUuid(params.id)) notFound();
  // Django decides: strangers and anonymous users get 404 (existence is not revealed).
  const result = await backendFetch<ProbeItem>(request, `/api/v1/probe/items/${params.id}/`);
  if (result.status !== 200 || !result.data) notFound();

  const csrf = await ensureCsrfToken(request);
  return data(
    { item: result.data, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!isUuid(params.id)) notFound();
  const form = await request.formData();
  const result = await backendFetch<ProbeItem>(request, `/api/v1/probe/items/${params.id}/touch/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
  });
  if (result.status === 404) notFound();
  if (result.status !== 200 || !result.data) {
    return data(
      { touchCount: null, error: "forbidden" as const },
      { status: 403, headers: privateNoStoreHeaders() },
    );
  }
  return data(
    { touchCount: result.data.touch_count, error: null },
    { headers: setCookieHeaders(result.setCookies, privateNoStoreHeaders()) },
  );
}

export function headers({ actionHeaders, loaderHeaders, errorHeaders }: Route.HeadersArgs) {
  if (errorHeaders) return errorHeaders;
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.item.title ?? "Private"} · ${brand.name}` },
    { name: "robots", content: "noindex" },
  ];
}

export default function ProbePrivate({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const count = actionData?.touchCount ?? loaderData.item.touch_count;
  return (
    <article>
      <p>{t("probe.private")}</p>
      <h1>{loaderData.item.title}</h1>
      <p>{loaderData.item.description}</p>
      <p data-testid="touch-count">{t("probe.touchCount", { count })}</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      <Form method="post">
        <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
        <button type="submit">{t("probe.touch")}</button>
      </Form>
    </article>
  );
}
