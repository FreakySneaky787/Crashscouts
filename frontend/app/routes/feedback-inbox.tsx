/**
 * The team's feedback inbox for one campaign (WP 5.4, ADR 0024): all feedback with filters for
 * kind, status and task (a plain GET form, works without JavaScript). Team only; 404 for everyone
 * else, like the testers page.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/feedback-inbox";
import { Button, ButtonLink } from "~/components/ui/Button";
import { SelectField } from "~/components/ui/Form";
import { FunnelIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { FEEDBACK_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { formatInZone, type Campaign, type CampaignTasks } from "~/lib/campaigns";
import { FEEDBACK_KINDS, TEAM_STATUSES, feedbackStatusStyleKey, isFeedbackKind, isFeedbackStatus, type Feedback } from "~/lib/feedback";
import { isUuid, privateNoStoreHeaders } from "~/lib/http";
import { isValidProjectSlug } from "~/lib/projects";

import styles from "~/components/feedback/Feedback.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Feedback inbox · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  const campaignSlug = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaignSlug)) throw data(null, { status: 404 });
  const api = `/api/v1/projects/${slug}/campaigns/${campaignSlug}/`;
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/c/${campaignSlug}/feedback`)}`, { headers: privateNoStoreHeaders() });
  }
  const search = new URL(request.url).searchParams;
  const filters = {
    kind: isFeedbackKind(search.get("kind")) ? search.get("kind")! : "",
    status: isFeedbackStatus(search.get("status")) ? search.get("status")! : "",
    task: isUuid(search.get("task") ?? "") ? search.get("task")! : "",
  };
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  const [campaign, feedback, tasks] = await Promise.all([
    backendFetch<Campaign>(request, api),
    backendFetch<Feedback[]>(request, `${api}feedback/${query ? `?${query}` : ""}`),
    backendFetch<CampaignTasks>(request, `${api}tasks/`),
  ]);
  if (campaign.status !== 200 || !campaign.data?.can_edit || feedback.status !== 200) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  return data(
    {
      campaign: campaign.data,
      feedback: feedback.data ?? [],
      tasks: (tasks.data?.tasks ?? []).map((task) => ({ id: task.id, title: task.title })),
      filters,
      filtered: Boolean(query),
    },
    { headers: privateNoStoreHeaders() },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function FeedbackInbox({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, feedback, tasks, filters, filtered } = loaderData;
  const base = `/p/${campaign.project}/c/${campaign.slug}`;
  const any = { value: "", label: t("feedback.inbox.any") };
  return (
    <div className={styles.stack}>
      <PageHeader breadcrumbs={[{ label: campaign.title, to: base }, { label: t("feedback.inbox.title") }]} title={t("feedback.inbox.title")} subtitle={t("feedback.inbox.intro")} />
      {campaign.new_feedback ? <Notice tone="info" title={t("feedback.inbox.newCount", { count: campaign.new_feedback })} /> : null}
      <Panel title={t("feedback.inbox.filters")}>
        <Form method="get" className={styles.filters}>
          <SelectField id="filter-kind" name="kind" label={t("feedback.inbox.kind")} defaultValue={filters.kind} options={[any, ...FEEDBACK_KINDS.map((k) => ({ value: k, label: t(`feedback.kinds.${k}`) }))]} />
          <SelectField
            id="filter-status"
            name="status"
            label={t("feedback.inbox.status")}
            defaultValue={filters.status}
            options={[any, ...(["new", ...TEAM_STATUSES, "verified"] as const).map((s) => ({ value: s, label: t(`feedback.statuses.${s}`) }))]}
          />
          {tasks.length ? (
            <SelectField id="filter-task" name="task" label={t("feedback.inbox.task")} defaultValue={filters.task} options={[any, ...tasks.map((task) => ({ value: task.id, label: task.title }))]} />
          ) : null}
          <div className={styles.buttons}>
            <Button type="submit" variant="secondary" icon={FunnelIcon}>
              {t("feedback.inbox.apply")}
            </Button>
            {filtered ? (
              <ButtonLink to={`${base}/feedback`} variant="quiet">
                {t("feedback.inbox.reset")}
              </ButtonLink>
            ) : null}
          </div>
        </Form>
      </Panel>
      <Panel title={t("feedback.title")} aside={t("feedback.count", { count: feedback.length })}>
        {feedback.length ? (
          <ul className={styles.files} aria-label={t("feedback.inbox.title")}>
            {feedback.map((item) => {
              const style = FEEDBACK_STATUS[feedbackStatusStyleKey(item.status)];
              return (
                <li key={item.id} className={styles.row}>
                  <span className={styles.stackTight}>
                    <Link to={`${base}/feedback/${item.id}`}>{item.title}</Link>
                    <span className={styles.muted}>
                      {t(`feedback.kinds.${item.kind}`)} · {item.author ?? t("feedback.tester")}
                      {item.task ? ` · ${item.task.title}` : ""}
                      {item.attachments.length ? ` · ${t("feedback.inbox.files", { count: item.attachments.length })}` : ""}
                      {" · "}
                      <time dateTime={item.created_at}>{formatInZone(item.created_at, campaign.timezone)}</time>
                    </span>
                  </span>
                  <StatusPill tone={style.tone} icon={"icon" in style ? style.icon : undefined} label={t(`feedback.statuses.${item.status}`)} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.muted}>{t(filtered ? "feedback.inbox.none" : "feedback.none")}</p>
        )}
      </Panel>
    </div>
  );
}
