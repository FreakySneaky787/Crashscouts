/**
 * One feedback (WPs 5.3 and 5.4, ADR 0024). Django decides who may see it (404 otherwise). The
 * author changes or withdraws it while "New", adds and removes files, confirms or reopens a fix
 * and consents to publishing. Files are shown only to the team and the author.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/feedback";
import { Button, ButtonLink } from "~/components/ui/Button";
import { FactList } from "~/components/ui/Data";
import { BlockNotice } from "~/components/moderation/BlockNotice";
import { CheckboxField, SelectField, TextField } from "~/components/ui/Form";
import { ArrowsClockwiseIcon, CheckCircleIcon, DownloadSimpleIcon, EyeIcon, FlagIcon, LockSimpleIcon, PencilSimpleIcon, TrashIcon, UploadSimpleIcon, XIcon } from "~/components/ui/icons";
import { Markdown } from "~/components/ui/Markdown";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { FEEDBACK_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { formatInZone, type Campaign } from "~/lib/campaigns";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_REQUEST_BYTES,
  MAX_ATTACHMENTS,
  TEAM_STATUSES,
  feedbackProblem,
  feedbackStatusStyleKey,
  formatSize,
  type Feedback,
  type FeedbackProblem,
} from "~/lib/feedback";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug } from "~/lib/projects";
import { reportHref } from "~/lib/reports";

import styles from "~/components/feedback/Feedback.module.css";

const DONE = ["sent", "saved", "added", "removed", "status", "published", "private"] as const;
type Done = (typeof DONE)[number];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.feedback.title ?? "Feedback"} · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function paths(params: { slug?: string; campaign?: string; id?: string }) {
  const slug = params.slug?.toLowerCase();
  const campaign = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaign) || !isUuid(params.id)) throw data(null, { status: 404 });
  const api = `/api/v1/projects/${slug}/campaigns/${campaign}/`;
  return { slug, campaign, api, feedbackApi: `${api}feedback/${params.id}/`, page: `/p/${slug}/c/${campaign}/feedback/${params.id}` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { api, feedbackApi } = paths(params);
  const [feedback, campaign] = await Promise.all([backendFetch<Feedback>(request, feedbackApi), backendFetch<Campaign>(request, api)]);
  if (feedback.status !== 200 || !feedback.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  // The team picks the original of a duplicate from the campaign's other feedback.
  const others = feedback.data.can_manage ? ((await backendFetch<Feedback[]>(request, `${api}feedback/`)).data ?? []).filter((f) => f.id !== feedback.data!.id) : [];
  const signedIn = Boolean(await getSessionUser(request));
  const csrf = signedIn ? await ensureCsrfToken(request) : null;
  const search = new URL(request.url).searchParams;
  const done = search.get("done");
  return data(
    {
      feedback: feedback.data,
      // Former participants of a private campaign still see their own feedback, not the campaign.
      campaign: campaign.status === 200 && campaign.data ? { title: campaign.data.title, timezone: campaign.data.timezone } : null,
      project: params.slug!.toLowerCase(),
      campaignSlug: params.campaign!.toLowerCase(),
      others: others.map((f) => ({ id: f.id, title: f.title })),
      csrfToken: csrf?.token ?? null,
      done: (DONE as readonly string[]).includes(done ?? "") ? (done as Done) : null,
      reported: search.get("reported") === "1",
      appeal: search.get("appeal"),
    },
    { headers: csrf ? setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) : privateNoStoreHeaders() },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { feedbackApi, page } = paths(params);
  const headers = privateNoStoreHeaders();
  // Files are at most 5 MB; larger requests are refused before the body is read.
  const length = Number(request.headers.get("Content-Length") ?? "NaN");
  if (!Number.isFinite(length) || length > MAX_ATTACHMENT_REQUEST_BYTES) {
    return data({ problem: "invalid_file" as FeedbackProblem }, { status: 413, headers });
  }
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const back = (done: Done) => redirect(`${page}?done=${done}`, { headers });
  const fail = (status: number, body: unknown) => {
    if (status === 404) throw data(null, { status: 404, headers });
    return data({ problem: feedbackProblem(status, body) }, { status: 400, headers });
  };

  if (intent === "withdraw") {
    if (form.get("confirm") !== "on") return data({ problem: "confirmWithdraw" as FeedbackProblem }, { status: 400, headers });
    const result = await backendFetch(request, feedbackApi, { method: "DELETE", csrfToken });
    if (result.status === 204) throw redirect("/account?feedback=withdrawn", { headers });
    return fail(result.status, result.data);
  }
  if (intent === "status") {
    const status = String(form.get("status") ?? "");
    const duplicateOf = String(form.get("duplicate_of") ?? "");
    const json: Record<string, string> = { status };
    if (duplicateOf) json.duplicate_of = duplicateOf;
    const result = await backendFetch(request, `${feedbackApi}status/`, { method: "POST", csrfToken, json });
    if (result.status === 200) throw back("status");
    return fail(result.status, result.data);
  }
  if (intent === "publish") {
    const step = String(form.get("step") ?? "");
    if (!["propose", "consent", "withdraw"].includes(step)) throw data(null, { status: 400, headers });
    const result = await backendFetch<Feedback>(request, `${feedbackApi}publish/${step}/`, { method: "POST", csrfToken });
    if (result.status === 200) throw back(result.data?.published ? "published" : step === "withdraw" ? "private" : "status");
    return fail(result.status, result.data);
  }
  if (intent === "attachment-add") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return data({ problem: "invalid_file" as FeedbackProblem }, { status: 400, headers });
    const upload = new FormData();
    upload.set("file", file, file.name);
    const result = await backendFetch(request, `${feedbackApi}attachments/`, { method: "POST", csrfToken, form: upload });
    if (result.status === 201) throw back("added");
    return fail(result.status, result.data);
  }
  if (intent === "attachment-remove") {
    const key = String(form.get("key") ?? "");
    if (!isUuid(key)) throw data(null, { status: 404, headers });
    const result = await backendFetch(request, `${feedbackApi}attachments/${key}/`, { method: "DELETE", csrfToken });
    if (result.status === 204) throw back("removed");
    return fail(result.status, result.data);
  }
  throw data(null, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function FeedbackPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { feedback, campaign, project, campaignSlug, csrfToken, done } = loaderData;
  const base = `/p/${project}/c/${campaignSlug}`;
  const style = FEEDBACK_STATUS[feedbackStatusStyleKey(feedback.status)];
  const zone = campaign?.timezone ?? "UTC";
  const problem = actionData?.problem ?? null;
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken ?? ""} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const sections = [
    { key: "steps", body: feedback.steps },
    { key: "expected", body: feedback.expected },
    { key: "actual", body: feedback.actual },
    { key: "suggestion", body: feedback.suggestion },
    { key: "solution", body: feedback.solution },
  ].filter((s) => s.body);
  const facts = [
    { label: t("feedback.detail.kind"), value: t(`feedback.kinds.${feedback.kind}`) },
    { label: t("feedback.detail.status"), value: t(`feedback.statuses.${feedback.status}`) },
    ...(feedback.duplicate_of
      ? [{ label: t("feedback.detail.duplicateOf"), value: <Link to={`${base}/feedback/${feedback.duplicate_of.id}`}>{feedback.duplicate_of.title}</Link> }]
      : []),
    ...(feedback.task ? [{ label: t("feedback.detail.task"), value: feedback.task.title }] : []),
    ...(feedback.platform ? [{ label: t("feedback.fields.platform"), value: feedback.platform.name }] : []),
    ...(feedback.version ? [{ label: t("feedback.fields.version"), value: <code>{feedback.version}</code> }] : []),
    ...(feedback.result ? [{ label: t("feedback.fields.result"), value: t(`feedback.results.${feedback.result}`) }] : []),
    ...(feedback.environment ? [{ label: t("feedback.fields.environment"), value: feedback.environment }] : []),
    ...(feedback.location ? [{ label: t("feedback.fields.location"), value: feedback.location }] : []),
    { label: t("feedback.detail.author"), value: feedback.author ?? t("feedback.tester") },
    { label: t("feedback.detail.sent"), value: <time dateTime={feedback.created_at}>{formatInZone(feedback.created_at, zone)}</time> },
  ];
  const showFiles = feedback.is_mine || feedback.can_manage;

  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[...(campaign ? [{ label: campaign.title, to: base }] : []), { label: t("feedback.title") }]}
        title={feedback.title}
        meta={
          <>
            <StatusPill tone={style.tone} icon={"icon" in style ? style.icon : undefined} label={t(`feedback.statuses.${feedback.status}`)} />
            {feedback.published ? <StatusPill tone="info" icon={EyeIcon} label={t("feedback.public")} /> : null}
          </>
        }
        actions={
          feedback.can_change ? (
            <ButtonLink to={`${base}/feedback/${feedback.id}/edit`} icon={PencilSimpleIcon}>
              {t("feedback.edit")}
            </ButtonLink>
          ) : feedback.published && !feedback.is_mine && !feedback.can_manage ? (
            // Published feedback can be reported by everyone who sees it (WP 7.1).
            <ButtonLink to={reportHref({ type: "feedback", project, campaign: campaignSlug, feedback: feedback.id })} variant="quiet" icon={FlagIcon}>
              {t("reports.action")}
            </ButtonLink>
          ) : null
        }
      />
      {loaderData.reported ? <Notice tone="ok" title={t("reports.thanks")} /> : null}
      {loaderData.appeal ? (
        <Notice tone={loaderData.appeal === "sent" ? "ok" : "danger"} title={t(loaderData.appeal === "sent" ? "moderation.team.sent" : "moderation.team.failed")} />
      ) : null}
      {feedback.moderation ? (
        <BlockNotice info={feedback.moderation} csrfToken={csrfToken} back={`${base}/feedback/${feedback.id}`} feedback canAppeal={feedback.can_manage} />
      ) : null}
      {done === "sent" ? <Notice tone="ok" title={t("feedback.sent")} /> : null}
      {done === "saved" ? <Notice tone="ok" title={t("feedback.saved")} /> : null}
      {done === "added" || done === "removed" ? <Notice tone="ok" title={t(`feedback.attachments.${done}`)} /> : null}
      {done === "status" || done === "published" || done === "private" ? <Notice tone="ok" title={t(`feedback.done.${done}`)} /> : null}
      {problem ? <Notice tone="danger" title={t(`feedback.problem.${problem}`)} /> : null}

      {feedback.can_manage ? (
        <Panel title={t("feedback.manage.title")}>
          <div className={styles.stack}>
            <Form method="post" className={styles.filters}>
              {hidden("status")}
              <SelectField
                id="manage-status"
                name="status"
                label={t("feedback.manage.status")}
                defaultValue={TEAM_STATUSES.includes(feedback.status) ? feedback.status : "reviewed"}
                options={TEAM_STATUSES.map((s) => ({ value: s, label: t(`feedback.statuses.${s}`) }))}
              />
              {loaderData.others.length ? (
                <SelectField
                  id="manage-duplicate"
                  name="duplicate_of"
                  label={t("feedback.manage.duplicateOf")}
                  defaultValue={feedback.duplicate_of?.id ?? ""}
                  options={[{ value: "", label: t("feedback.manage.noOriginal") }, ...loaderData.others.map((o) => ({ value: o.id, label: o.title }))]}
                />
              ) : null}
              <div>
                <Button type="submit" variant="primary" icon={CheckCircleIcon}>
                  {t("feedback.manage.setStatus")}
                </Button>
              </div>
            </Form>
            <p className={styles.muted}>{t("feedback.manage.authorTold")}</p>
            {feedback.moderation ? null : !feedback.publish_proposed ? (
              <Form method="post" className={styles.stackTight}>
                {hidden("publish")}
                <input type="hidden" name="step" value="propose" />
                <p className={styles.muted}>{t("feedback.manage.proposeText")}</p>
                <div>
                  <Button type="submit" variant="secondary" icon={EyeIcon}>
                    {t("feedback.manage.propose")}
                  </Button>
                </div>
              </Form>
            ) : !feedback.published ? (
              <Form method="post" className={styles.stackTight}>
                {hidden("publish")}
                <input type="hidden" name="step" value="withdraw" />
                <p>{t("feedback.manage.waiting")}</p>
                <div>
                  <Button type="submit" variant="secondary" icon={LockSimpleIcon}>
                    {t("feedback.manage.withdrawProposal")}
                  </Button>
                </div>
              </Form>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {feedback.is_mine && feedback.can_verify ? (
        <Panel title={t("feedback.verify.title")}>
          <div className={styles.stack}>
            <p>{t("feedback.verify.text")}</p>
            <div className={styles.buttons}>
              <Form method="post">
                {hidden("status")}
                <input type="hidden" name="status" value="verified" />
                <Button type="submit" variant="primary" icon={CheckCircleIcon}>
                  {t("feedback.verify.verified")}
                </Button>
              </Form>
              <Form method="post">
                {hidden("status")}
                <input type="hidden" name="status" value="confirmed" />
                <Button type="submit" variant="secondary" icon={ArrowsClockwiseIcon}>
                  {t("feedback.verify.reopen")}
                </Button>
              </Form>
            </div>
          </div>
        </Panel>
      ) : null}

      {feedback.is_mine && feedback.publish_proposed && !feedback.published ? (
        <Panel title={t("feedback.publish.proposedTitle")}>
          <div className={styles.stack}>
            <p>{t("feedback.publish.proposedText")}</p>
            <div className={styles.buttons}>
              <Form method="post">
                {hidden("publish")}
                <input type="hidden" name="step" value="consent" />
                <Button type="submit" variant="primary" icon={EyeIcon}>
                  {t("feedback.publish.consent")}
                </Button>
              </Form>
              <Form method="post">
                {hidden("publish")}
                <input type="hidden" name="step" value="withdraw" />
                <Button type="submit" variant="secondary" icon={LockSimpleIcon}>
                  {t("feedback.publish.decline")}
                </Button>
              </Form>
            </div>
          </div>
        </Panel>
      ) : null}
      {feedback.published ? (
        <Notice tone="info" title={t("feedback.publish.publicNotice")}>
          {feedback.is_mine || feedback.can_manage ? (
            <Form method="post">
              {hidden("publish")}
              <input type="hidden" name="step" value="withdraw" />
              <Button type="submit" variant="secondary" size="sm" icon={LockSimpleIcon}>
                {t("feedback.publish.makePrivate")}
              </Button>
            </Form>
          ) : null}
        </Notice>
      ) : null}

      <Panel title={t("feedback.fields.description")}>
        <div className={styles.stack}>
          <Markdown>{feedback.description}</Markdown>
          {sections.map((section) => (
            <div key={section.key} className={styles.stackTight}>
              <h3 className={styles.muted}>{t(`feedback.fields.${section.key as "steps"}`)}</h3>
              <Markdown>{section.body}</Markdown>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={t("campaigns.details")}>
        <FactList items={facts} />
      </Panel>

      {showFiles ? (
        <Panel title={t("feedback.attachments.title")}>
          <div className={styles.stack}>
            <p className={styles.muted}>{t("feedback.attachments.intro")}</p>
            {feedback.attachments.length ? (
              <ul className={styles.files} aria-label={t("feedback.attachments.title")}>
                {feedback.attachments.map((file) => (
                  <li key={file.key} className={styles.stackTight}>
                    {file.kind === "image" ? <img className={styles.shot} src={`/feedback-attachments/${file.key}`} alt={t("feedback.attachments.imageAlt", { name: file.name })} loading="lazy" /> : null}
                    <div className={styles.row}>
                      <a href={`/feedback-attachments/${file.key}`} download={file.kind === "text" ? file.name : undefined}>
                        <DownloadSimpleIcon aria-hidden="true" /> {t("feedback.attachments.download", { name: file.name })}
                      </a>
                      <span className={styles.muted}>{formatSize(file.size)}</span>
                      {feedback.can_change ? (
                        <Form method="post">
                          {hidden("attachment-remove")}
                          <input type="hidden" name="key" value={file.key} />
                          <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("feedback.attachments.removeNamed", { name: file.name })}>
                            {t("feedback.attachments.remove")}
                          </Button>
                        </Form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t("feedback.attachments.none")}</p>
            )}
            {feedback.can_change && feedback.attachments.length < MAX_ATTACHMENTS ? (
              <Form method="post" encType="multipart/form-data" className={styles.form}>
                {hidden("attachment-add")}
                <TextField id="feedback-file" name="file" type="file" accept={ATTACHMENT_ACCEPT} label={t("feedback.attachments.file")} required />
                <div>
                  <Button type="submit" variant="secondary" icon={UploadSimpleIcon}>
                    {t("feedback.attachments.add")}
                  </Button>
                </div>
              </Form>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {feedback.history?.length ? (
        <Panel title={t("feedback.detail.history")}>
          <ol className={styles.history}>
            {feedback.history.map((entry) => (
              <li key={entry.at}>
                <time dateTime={entry.at}>{formatInZone(entry.at, zone)}</time>
                {" · "}
                {t(entry.role === "team" ? "feedback.detail.historyTeam" : "feedback.detail.historyAuthor", { status: t(`feedback.statuses.${entry.status}`) })}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {feedback.can_change ? (
        <Panel title={t("feedback.withdrawTitle")}>
          <Form method="post" className={styles.form}>
            <p>{t("feedback.withdrawText")}</p>
            {hidden("withdraw")}
            <CheckboxField id="confirm-withdraw" name="confirm" label={t("feedback.withdrawConfirm", { title: feedback.title })} />
            <div>
              <Button type="submit" variant="danger" icon={TrashIcon}>
                {t("feedback.withdraw")}
              </Button>
            </div>
          </Form>
        </Panel>
      ) : null}
    </div>
  );
}
