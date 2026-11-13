/** Moderation queue (WP 3B.3): open cases (malware and suspended links first) and appeals.
 * Moderators only; 404 for everyone else. */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/moderation";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextAreaField } from "~/components/ui/Form";
import { EmptyState } from "~/components/ui/EmptyState";
import { Notice } from "~/components/ui/Notice";
import { WarningIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import type { Appeal, ModerationCase, Reviews } from "~/lib/moderation";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Moderation · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation", { headers: privateNoStoreHeaders() });
  const [cases, appeals, reviews, csrf] = await Promise.all([
    backendFetch<ModerationCase[]>(request, "/api/v1/moderation/cases/"),
    backendFetch<Appeal[]>(request, "/api/v1/moderation/appeals/"),
    backendFetch<Reviews>(request, "/api/v1/moderation/reviews/"),
    ensureCsrfToken(request),
  ]);
  if (cases.status !== 200 || !cases.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const done = new URL(request.url).searchParams.get("done");
  return data(
    { cases: cases.data, appeals: appeals.data ?? [], reviews: reviews.data ?? { campaigns: [], links: [] }, done, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

const REVIEW_PROBLEMS = ["message_required", "not_in_review", "too_long", "confirm", "generic"] as const;
type ReviewProblem = (typeof REVIEW_PROBLEMS)[number];

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const headers = privateNoStoreHeaders();
  const kind = String(form.get("kind") ?? "");
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  if (!["campaign", "link"].includes(kind) || !isUuid(id) || !["approve", "reject"].includes(decision)) throw data(null, { status: 400, headers });
  if (decision === "reject" && form.get("confirm") !== "on") return data({ problem: "confirm" as ReviewProblem }, { status: 400, headers });
  const result = await backendFetch(request, `/api/v1/moderation/reviews/${kind}/${id}/${decision}/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { message: String(form.get("message") ?? "") },
  });
  if (result.status === 204) throw redirect("/moderation?done=review", { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const code = (result.data as { code?: string } | null)?.code ?? "";
  return data({ problem: ((REVIEW_PROBLEMS as readonly string[]).includes(code) ? code : "generic") as ReviewProblem }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

function ReviewForms({ kind, id, csrfToken }: { kind: "campaign" | "link"; id: string; csrfToken: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.buttonRow}>
      <Form method="post">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <Button type="submit" size="sm" variant="primary">
          {t("moderation.approve")}
        </Button>
      </Form>
      <Form method="post" className={styles.form}>
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <TextAreaField id={`reject-${id}`} name="message" label={t("moderation.rejectMessage")} rows={2} maxLength={1000} />
        <CheckboxField id={`reject-confirm-${id}`} name="confirm" label={t("moderation.rejectConfirm")} />
        <div>
          <Button type="submit" size="sm" variant="secondary">
            {t("moderation.reject")}
          </Button>
        </div>
      </Form>
    </div>
  );
}

export default function Moderation({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { cases, appeals, reviews, csrfToken } = loaderData;
  const reviewCount = reviews.campaigns.length + reviews.links.length;
  return (
    <div className={styles.stack}>
      <PageHeader title={t("moderation.title")} subtitle={t("moderation.intro")} />
      {loaderData.done ? <Notice tone="ok" title={t("moderation.done")} /> : null}
      {actionData?.problem ? <Notice tone="danger" title={t(`moderation.problem.${actionData.problem}`)} /> : null}
      <Panel title={t("moderation.reviews")} aside={String(reviewCount)}>
        {reviewCount ? (
          <ul className={styles.plainList} aria-label={t("moderation.reviews")}>
            {reviews.campaigns.map((c) => (
              <li key={c.id} className={styles.stack}>
                <span className={styles.stackTight}>
                  <strong>
                    {t("moderation.reviewCampaign")}: {c.title}
                  </strong>
                  <span className={styles.muted}>
                    {c.project_name} · {c.summary}
                  </span>
                  {c.links.map((l) => (
                    <code key={l.id} className={styles.secret}>
                      {l.label}: {l.url}
                    </code>
                  ))}
                </span>
                <ReviewForms kind="campaign" id={c.id} csrfToken={csrfToken} />
              </li>
            ))}
            {reviews.links.map((l) => (
              <li key={l.id} className={styles.stack}>
                <span className={styles.stackTight}>
                  <strong>
                    {t("moderation.reviewLink")}: {l.label}
                  </strong>
                  <span className={styles.muted}>
                    {l.project_name} · {l.campaign_title}
                  </span>
                  <code className={styles.secret}>{l.url}</code>
                  {l.sha256 ? <code className={styles.secret}>SHA-256 {l.sha256}</code> : null}
                </span>
                <ReviewForms kind="link" id={l.id} csrfToken={csrfToken} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState kind="empty" title={t("moderation.noReviews")} />
        )}
      </Panel>
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
