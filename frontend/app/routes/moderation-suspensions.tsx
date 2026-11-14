/**
 * All account suspensions with who suspended, lifted and decided the appeal (WP 7.2, ADR 0027).
 * Admins only (404 for everyone else): any moderator may suspend and decide the appeal, so admins
 * keep the overview (owner's decision 2026-11-14, no four-eyes principle).
 */
import { useTranslation } from "react-i18next";
import { data, Link, redirect } from "react-router";

import type { Route } from "./+types/moderation-suspensions";
import { EmptyState } from "~/components/ui/EmptyState";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { formatInZone } from "~/lib/campaigns";
import { privateNoStoreHeaders } from "~/lib/http";
import type { Suspension } from "~/lib/moderation";

import styles from "./forms.module.css";
import table from "./moderation-suspensions.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Suspensions · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation%2Fsuspensions", { headers: privateNoStoreHeaders() });
  const result = await backendFetch<Suspension[]>(request, "/api/v1/moderation/account-suspensions/");
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return data({ suspensions: result.data }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

const when = (iso: string | null) => (iso ? `${formatInZone(iso, "UTC")} UTC` : "–");

export default function ModerationSuspensions({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { suspensions } = loaderData;
  return (
    <div className={styles.stack}>
      <PageHeader breadcrumbs={[{ label: t("moderation.title"), to: "/moderation" }, { label: t("suspension.admin.title") }]} title={t("suspension.admin.title")} subtitle={t("suspension.admin.intro")} />
      <Panel title={t("suspension.admin.all")} aside={String(suspensions.length)}>
        {suspensions.length ? (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <caption className="visually-hidden">{t("suspension.admin.all")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("suspension.admin.person")}</th>
                  <th scope="col">{t("suspension.admin.state")}</th>
                  <th scope="col">{t("moderation.category")}</th>
                  <th scope="col">{t("suspension.admin.suspendedBy")}</th>
                  <th scope="col">{t("suspension.admin.end")}</th>
                  <th scope="col">{t("suspension.admin.liftedBy")}</th>
                  <th scope="col">{t("suspension.admin.appeal")}</th>
                </tr>
              </thead>
              <tbody>
                {suspensions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/moderation/user/${s.user_id}`}>@{s.username}</Link>
                    </td>
                    <td>{s.active ? <StatusPill tone="danger" label={t("suspension.admin.active")} /> : <StatusPill tone="neutral" label={t("suspension.admin.over")} />}</td>
                    <td>{t(`reports.reasons.${s.category}`)}</td>
                    <td>
                      {s.created_by ?? t("moderation.deletedAccount")} · {when(s.created_at)}
                    </td>
                    <td>{s.ends_at ? when(s.ends_at) : t("suspension.admin.permanent")}</td>
                    <td>{s.lifted_at ? `${s.lifted_by ?? t("moderation.deletedAccount")} · ${when(s.lifted_at)}` : "–"}</td>
                    <td>{s.appeal === "none" ? "–" : `${t(`suspension.admin.appealStates.${s.appeal}`)}${s.appeal_decided_by ? ` · ${s.appeal_decided_by}` : ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState kind="empty" title={t("suspension.admin.none")} />
        )}
      </Panel>
    </div>
  );
}
