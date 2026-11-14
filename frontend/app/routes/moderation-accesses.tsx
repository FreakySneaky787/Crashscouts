/** Every purpose-bound moderator access with moderator, reason and views (WP 7.3, ADR 0028).
 * Admins only; 404 for everyone else. */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/moderation-accesses";
import { EmptyState } from "~/components/ui/EmptyState";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { formatInZone } from "~/lib/campaigns";
import { privateNoStoreHeaders } from "~/lib/http";
import type { ModeratorAccess } from "~/lib/moderation";

import styles from "./forms.module.css";
import table from "./moderation-suspensions.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Moderator accesses · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation%2Faccesses", { headers: privateNoStoreHeaders() });
  const result = await backendFetch<ModeratorAccess[]>(request, "/api/v1/moderation/accesses/");
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return data({ accesses: result.data }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function ModerationAccesses({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { accesses } = loaderData;
  return (
    <div className={styles.stack}>
      <PageHeader breadcrumbs={[{ label: t("moderation.title"), to: "/moderation" }, { label: t("access.admin.title") }]} title={t("access.admin.title")} subtitle={t("access.admin.intro")} />
      <Panel title={t("access.admin.all")} aside={String(accesses.length)}>
        {accesses.length ? (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <caption className="visually-hidden">{t("access.admin.all")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("access.admin.moderator")}</th>
                  <th scope="col">{t("access.admin.content")}</th>
                  <th scope="col">{t("access.reason")}</th>
                  <th scope="col">{t("access.admin.opened")}</th>
                  <th scope="col">{t("access.admin.state")}</th>
                  <th scope="col">{t("access.admin.views")}</th>
                </tr>
              </thead>
              <tbody>
                {accesses.map((a) => (
                  <tr key={a.id}>
                    <td>{a.moderator ?? t("moderation.deletedAccount")}</td>
                    <td>
                      {t(`moderation.types.${a.target_type}`)}: {a.target_label}
                    </td>
                    <td>{a.reason}</td>
                    <td>{formatInZone(a.created_at, "UTC")} UTC</td>
                    <td>{a.active ? <StatusPill tone="warn" label={t("access.admin.active")} /> : <StatusPill tone="neutral" label={t("access.admin.expired")} />}</td>
                    <td>{a.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState kind="empty" title={t("access.admin.none")} />
        )}
      </Panel>
    </div>
  );
}
