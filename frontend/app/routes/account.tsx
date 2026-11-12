import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/account";
import { brand } from "~/config/brand";
import { ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

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
    <section>
      <h1>{t("account.title")}</h1>
      <p data-testid="signed-in-as">{t("account.signedInAs", { username: loaderData.username })}</p>
      <Form method="post" action="/logout">
        <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
        <button type="submit">{t("nav.logout")}</button>
      </Form>
    </section>
  );
}
