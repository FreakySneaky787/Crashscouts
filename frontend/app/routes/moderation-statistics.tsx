/**
 * Moderation statistics for admins (WP 7.4, ADR 0029): sums per calendar month (UTC) for the last
 * 12 months, never single cases or people. 404 for everyone but admins.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/moderation-statistics";
import { KeyFigures } from "~/components/ui/Data";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";
import type { ModerationStatistics } from "~/lib/moderation";

import styles from "./forms.module.css";
import table from "./moderation-suspensions.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Moderation statistics · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation%2Fstatistics", { headers: privateNoStoreHeaders() });
  const result = await backendFetch<ModerationStatistics>(request, "/api/v1/moderation/statistics/");
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return data({ stats: result.data }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

const COLUMNS = [
  "reports",
  "resolved",
  "dismissed",
  "hours_to_decision",
  "blocks",
  "block_appeals",
  "suspensions",
  "permanent_suspensions",
  "suspension_appeals",
  "appeals_lifted",
  "appeals_upheld",
  "accesses",
] as const;

export default function ModerationStatisticsPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { stats } = loaderData;
  const month = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const breakdown = (counts: Record<string, number>, prefix: "reports.reasons" | "moderation.types") =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `${t(`${prefix}.${key}`, { defaultValue: key })} ${n}`)
      .join(", ") || "–";
  return (
    <div className={styles.stack}>
      <PageHeader breadcrumbs={[{ label: t("moderation.title"), to: "/moderation" }, { label: t("statistics.title") }]} title={t("statistics.title")} subtitle={t("statistics.intro")} />
      <Panel title={t("statistics.now")}>
        <KeyFigures
          items={[
            { value: stats.now.open_cases, label: t("statistics.openCases") },
            { value: stats.now.open_reports, label: t("statistics.openReports") },
            { value: stats.now.active_blocks, label: t("statistics.activeBlocks") },
            { value: stats.now.open_appeals, label: t("statistics.openAppeals") },
          ]}
        />
      </Panel>
      <Panel title={t("statistics.perMonth")}>
        <div className={table.tableWrap} role="region" aria-label={t("statistics.perMonth")} tabIndex={0}>
          <table className={table.table}>
            <caption className="visually-hidden">{t("statistics.perMonth")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("statistics.month")}</th>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col">
                    {t(`statistics.columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{month(m.month)}</th>
                  {COLUMNS.map((c) => (
                    <td key={c}>{m[c] ?? "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("statistics.breakdown")}>
        <div className={table.tableWrap} role="region" aria-label={t("statistics.breakdown")} tabIndex={0}>
          <table className={table.table}>
            <caption className="visually-hidden">{t("statistics.breakdown")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("statistics.month")}</th>
                <th scope="col">{t("statistics.byReason")}</th>
                <th scope="col">{t("statistics.byTarget")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.months
                .filter((m) => m.reports > 0)
                .map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{month(m.month)}</th>
                    <td>{breakdown(m.by_reason, "reports.reasons")}</td>
                    <td>{breakdown(m.by_target, "moderation.types")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{t("statistics.note")}</p>
      </Panel>
    </div>
  );
}
