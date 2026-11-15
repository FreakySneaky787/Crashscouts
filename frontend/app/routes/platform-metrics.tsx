/**
 * Growth metrics for platform admins (WP M.1, ADR 0030, docs/METRICS.md): the five metrics per
 * month and for all time, computed by Django from the platform's own data. Counts, shares and
 * medians only; never single people. 404 for everyone but admins.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/platform-metrics";
import { KeyFigures } from "~/components/ui/Data";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";
import { formatHours, formatShare, type GrowthMetrics, type Returning } from "~/lib/metrics";

import styles from "./forms.module.css";
import table from "./moderation-suspensions.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Growth metrics · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fplatform%2Fmetrics", { headers: privateNoStoreHeaders() });
  const result = await backendFetch<GrowthMetrics>(request, "/api/v1/platform/metrics/");
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return data({ metrics: result.data }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

const METRICS = ["firstTester", "completion", "usefulFeedback", "returningTesters", "returningDevelopers"] as const;

export default function PlatformMetrics({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { metrics } = loaderData;
  const all = metrics.all_time;
  const month = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const ratio = (part: number, whole: number) => t("metrics.of", { part, whole });
  const returning = (r: Returning) => (r.people ? `${formatShare(r.rate)} (${ratio(r.returning, r.people)})` : "–");
  return (
    <div className={styles.stack}>
      <PageHeader title={t("metrics.title")} subtitle={t("metrics.intro")} />
      <Panel title={t("metrics.allTime")}>
        <KeyFigures
          items={[
            { value: formatHours(all.time_to_first_tester.median_hours), label: t("metrics.names.firstTester") },
            { value: formatShare(all.completion_rate.rate), label: t("metrics.names.completion") },
            { value: formatShare(all.useful_feedback_rate.rate), label: t("metrics.names.usefulFeedback") },
            { value: formatShare(all.returning_testers.rate), label: t("metrics.names.returningTesters") },
            { value: formatShare(all.returning_developers.rate), label: t("metrics.names.returningDevelopers") },
          ]}
        />
        <p className={styles.muted}>
          {t("metrics.basis", {
            campaigns: all.time_to_first_tester.campaigns,
            testers: all.returning_testers.people,
            developers: all.returning_developers.people,
          })}
        </p>
      </Panel>
      <Panel title={t("metrics.perMonth")}>
        <div className={table.tableWrap} role="region" aria-label={t("metrics.perMonth")} tabIndex={0}>
          <table className={table.table}>
            <caption className="visually-hidden">{t("metrics.perMonth")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("metrics.month")}</th>
                <th scope="col">{t("metrics.columns.campaigns")}</th>
                <th scope="col">{t("metrics.names.firstTester")}</th>
                <th scope="col">{t("metrics.columns.withoutTester")}</th>
                <th scope="col">{t("metrics.names.completion")}</th>
                <th scope="col">{t("metrics.names.usefulFeedback")}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{month(m.month)}</th>
                  <td>{m.time_to_first_tester.campaigns}</td>
                  <td>{formatHours(m.time_to_first_tester.median_hours)}</td>
                  <td>{m.time_to_first_tester.campaigns ? formatShare(m.time_to_first_tester.without_tester_share) : "–"}</td>
                  <td>{m.completion_rate.ended ? `${formatShare(m.completion_rate.rate)} (${ratio(m.completion_rate.completed, m.completion_rate.ended)})` : "–"}</td>
                  <td>
                    {m.useful_feedback_rate.completed
                      ? `${formatShare(m.useful_feedback_rate.rate)} (${ratio(m.useful_feedback_rate.with_useful_feedback, m.useful_feedback_rate.completed)})`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("metrics.cohorts")}>
        <div className={table.tableWrap} role="region" aria-label={t("metrics.cohorts")} tabIndex={0}>
          <table className={table.table}>
            <caption className="visually-hidden">{t("metrics.cohorts")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("metrics.cohortMonth")}</th>
                <th scope="col">{t("metrics.names.returningTesters")}</th>
                <th scope="col">{t("metrics.names.returningDevelopers")}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{month(m.month)}</th>
                  <td>{returning(m.returning_testers)}</td>
                  <td>{returning(m.returning_developers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("metrics.definitions")}>
        <dl className={styles.stack}>
          {METRICS.map((key) => (
            <div key={key}>
              <dt>
                <strong>{t(`metrics.names.${key}`)}</strong>
              </dt>
              <dd>{t(`metrics.explain.${key}`)}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.muted}>{t("metrics.privacy")}</p>
      </Panel>
    </div>
  );
}
