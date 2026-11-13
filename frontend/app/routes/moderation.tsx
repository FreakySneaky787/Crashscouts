/** Moderation queue (WP 3B.3): open cases (malware and suspended links first) and appeals.
 * Moderators only; 404 for everyone else. */
import { useTranslation } from "react-i18next";
import { data, Link, redirect } from "react-router";

import type { Route } from "./+types/moderation";
import { EmptyState } from "~/components/ui/EmptyState";
import { WarningIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders } from "~/lib/http";
import type { Appeal, ModerationCase } from "~/lib/moderation";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Moderation · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation", { headers: privateNoStoreHeaders() });
  const [cases, appeals] = await Promise.all([
    backendFetch<ModerationCase[]>(request, "/api/v1/moderation/cases/"),
    backendFetch<Appeal[]>(request, "/api/v1/moderation/appeals/"),
  ]);
  if (cases.status !== 200 || !cases.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const done = new URL(request.url).searchParams.get("done");
  return data({ cases: cases.data, appeals: appeals.data ?? [], done }, { headers: privateNoStoreHeaders() });
}

export default function Moderation({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { cases, appeals } = loaderData;
  return (
    <div className={styles.stack}>
      <PageHeader title={t("moderation.title")} subtitle={t("moderation.intro")} />
      <Panel title={t("moderation.cases")} aside={String(cases.length)}>
        {cases.length ? (
          <ul className={styles.plainList} aria-label={t("moderation.cases")}>
            {cases.map((c) => (
              <li key={`${c.target_type}-${c.target_id}`} className={styles.listRow}>
                <span className={styles.stackTight}>
                  <Link to={`/moderation/${c.target_type}/${c.target_id}`}>{c.title}</Link>
                  <span className={styles.muted}>
                    {t(`moderation.types.${c.target_type}`)} · {c.project_name} · {t("moderation.reportCount", { count: c.reports })}
                  </span>
                </span>
                <span className={styles.buttonRow}>
                  {c.malware ? <StatusPill tone="danger" icon={WarningIcon} label={t("reports.reasons.malware")} /> : null}
                  {c.suspended ? <StatusPill tone="warn" label={t("campaigns.links.suspended")} /> : null}
                  {c.blocked ? <StatusPill tone="neutral" label={t("moderation.blocked")} /> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState kind="empty" title={t("moderation.noCases")} />
        )}
      </Panel>
      <Panel title={t("moderation.appeals")} aside={String(appeals.length)}>
        {appeals.length ? (
          <ul className={styles.plainList} aria-label={t("moderation.appeals")}>
            {appeals.map((a) => (
              <li key={a.block} className={styles.stackTight}>
                <Link to={`/moderation/${a.target_type}/${a.target_id}`}>{a.title}</Link>
                <span className={styles.muted}>{a.appeal_text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState kind="empty" title={t("moderation.noAppeals")} />
        )}
      </Panel>
    </div>
  );
}
