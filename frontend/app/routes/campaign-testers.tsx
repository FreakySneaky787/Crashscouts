/**
 * Testers of a campaign (WP 3A.5): the team invites people by username to private campaigns,
 * sees open invitations (revocable) and current participants. 404 outside the team.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/campaign-testers";
import { ProgressOverviewPanel } from "~/components/campaigns/ProgressOverviewPanel";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextField } from "~/components/ui/Form";
import { UserPlusIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { type Campaign, type ProgressOverview } from "~/lib/campaigns";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidUsername } from "~/lib/profile";
import { isValidProjectSlug } from "~/lib/projects";

import styles from "./forms.module.css";

type Testers = {
  invitations: { id: string; username: string; invited_by: string | null; expires_at: string }[];
  participants: {
    username: string;
    joined_at: string;
    profile: { platforms?: { slug: string; name: string }[]; skills?: { slug: string; name: string }[] };
  }[];
};

type PendingApplication = {
  id: string;
  username: string;
  created_at: string;
  answers: { prompt: string; value: string }[];
  profile: { platforms?: { slug: string; name: string }[]; skills?: { slug: string; name: string }[] };
};

const RESULTS = ["invited", "revoked", "removed", "approved", "rejected"] as const;
const PROBLEMS = [
  "user_not_found",
  "already_team",
  "already_invited",
  "already_participant",
  "removed",
  "too_many_invitations",
  "not_private",
  "not_published",
  "not_participant",
  "confirmRemove",
  "confirmReject",
  "campaign_full",
  "no_open_application",
  "rateLimited",
  "generic",
] as const;
type Problem = (typeof PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Testers · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function paths(params: { slug?: string; campaign?: string }) {
  const slug = params.slug?.toLowerCase();
  const campaign = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaign)) throw data(null, { status: 404 });
  return { slug, campaign, api: `/api/v1/projects/${slug}/campaigns/${campaign}/` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { slug, campaign: campaignSlug, api } = paths(params);
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/c/${campaignSlug}/testers`)}`, { headers: privateNoStoreHeaders() });
  }
  const [campaign, testers, applications, progress, csrf] = await Promise.all([
    backendFetch<Campaign>(request, api),
    backendFetch<Testers>(request, `${api}invitations/`),
    backendFetch<PendingApplication[]>(request, `${api}applications/`),
    // Everyone's task progress (WP 4.4): the team only; 404 for everyone else, like this page.
    backendFetch<ProgressOverview>(request, `${api}progress/`),
    ensureCsrfToken(request),
  ]);
  if (campaign.status !== 200 || !campaign.data || testers.status !== 200 || !testers.data) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  if (campaign.data.slug !== params.campaign || campaign.data.project !== params.slug) {
    throw redirect(`/p/${campaign.data.project}/c/${campaign.data.slug}/testers`, { headers: privateNoStoreHeaders() });
  }
  const done = new URL(request.url).searchParams.get("done");
  return data(
    {
      campaign: campaign.data,
      testers: testers.data,
      applications: applications.status === 200 ? (applications.data ?? []) : [],
      progress: progress.status === 200 ? progress.data : null,
      csrfToken: csrf.token,
      done: (RESULTS as readonly string[]).includes(done ?? "") ? (done as (typeof RESULTS)[number]) : null,
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { slug, campaign, api } = paths(params);
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const headers = privateNoStoreHeaders();
  let result;
  let success: (typeof RESULTS)[number];
  if (intent === "invite") {
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    if (!isValidUsername(username)) return data({ problem: "user_not_found" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${api}invitations/`, { method: "POST", csrfToken, json: { username } });
    success = "invited";
  } else if (intent === "revoke") {
    const id = String(form.get("id") ?? "");
    if (!isUuid(id)) throw data(null, { status: 404 });
    result = await backendFetch(request, `${api}invitations/${id}/`, { method: "DELETE", csrfToken });
    success = "revoked";
  } else if (intent === "approve" || intent === "reject") {
    const id = String(form.get("id") ?? "");
    if (!isUuid(id)) throw data(null, { status: 404 });
    if (intent === "reject" && form.get("confirm") !== "on") return data({ problem: "confirmReject" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${api}applications/${id}/${intent}/`, { method: "POST", csrfToken });
    success = intent === "approve" ? "approved" : "rejected";
  } else if (intent === "remove") {
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    if (!isValidUsername(username)) throw data(null, { status: 404 });
    if (form.get("confirm") !== "on") return data({ problem: "confirmRemove" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${api}participants/${username}/`, { method: "DELETE", csrfToken });
    success = "removed";
  } else {
    throw data(null, { status: 400 });
  }
  if (result.status === 201 || result.status === 204) throw redirect(`/p/${slug}/c/${campaign}/testers?done=${success}`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const code = (result.data as { code?: string } | null)?.code ?? "";
  const problem: Problem = result.status === 429 ? "rateLimited" : (PROBLEMS as readonly string[]).includes(code) ? (code as Problem) : "generic";
  return data({ problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function CampaignTesters({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, testers, applications, progress, csrfToken, done } = loaderData;
  const canInvite = campaign.visibility === "private" && campaign.state === "published";
  const back = `/p/${campaign.project}/c/${campaign.slug}`;
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: campaign.title, to: back }, { label: t("campaigns.testers.title") }]}
        title={t("campaigns.testers.title")}
        subtitle={t("campaigns.testers.intro")}
      />
      {done ? <Notice tone="ok" title={t(`campaigns.testers.done.${done}`)} /> : null}
      {actionData?.problem ? <Notice tone="danger" title={t(`campaigns.testers.problem.${actionData.problem}`)} /> : null}

      {campaign.new_feedback ? (
        <Notice tone="info" title={t("feedback.inbox.newCount", { count: campaign.new_feedback })}>
          <Link to={`${back}/feedback`}>{t("feedback.inbox.open")}</Link>
        </Notice>
      ) : null}
      {campaign.method !== "free" && progress ? <ProgressOverviewPanel overview={progress} /> : null}

      <Panel title={t("campaigns.testers.participants")} aside={t("campaigns.placesValue", { count: testers.participants.length, total: campaign.target_testers })}>
        {testers.participants.length ? (
          <ul className={styles.plainList} aria-label={t("campaigns.testers.participants")}>
            {testers.participants.map((p) => {
              const details = [...(p.profile.platforms ?? []), ...(p.profile.skills ?? [])].map((i) => i.name);
              return (
                <li key={p.username} className={styles.listRow}>
                  <span className={styles.stackTight}>
                    <Link to={`/u/${p.username}`}>{p.username}</Link>
                    <span className={styles.muted}>{details.length ? details.join(" · ") : t("campaigns.testers.noDetails")}</span>
                  </span>
                  <Form method="post" className={styles.buttonRow}>
                    <input type="hidden" name="csrf_token" value={csrfToken} />
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="username" value={p.username} />
                    <CheckboxField id={`confirm-remove-${p.username}`} name="confirm" label={t("campaigns.testers.removeConfirm", { username: p.username })} />
                    <Button type="submit" size="sm" variant="danger" icon={XIcon}>
                      {t("campaigns.testers.remove")}
                    </Button>
                  </Form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.muted}>{t("campaigns.testers.noParticipants")}</p>
        )}
      </Panel>

      {campaign.participation === "approval" ? (
        <Panel title={t("campaigns.testers.applications")} aside={String(applications.length)}>
          {applications.length ? (
            <ul className={styles.plainList} aria-label={t("campaigns.testers.applications")}>
              {applications.map((a) => (
                <li key={a.id} className={styles.stackTight}>
                  <Link to={`/u/${a.username}`}>{a.username}</Link>
                  {a.answers.length ? (
                    <dl className={styles.stackTight}>
                      {a.answers.map((answer) => (
                        <div key={answer.prompt}>
                          <dt className={styles.muted}>{answer.prompt}</dt>
                          <dd>{answer.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <div className={styles.buttonRow}>
                    <Form method="post">
                      <input type="hidden" name="csrf_token" value={csrfToken} />
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" size="sm" variant="primary" aria-label={t("campaigns.testers.approveNamed", { username: a.username })}>
                        {t("campaigns.testers.approve")}
                      </Button>
                    </Form>
                    <Form method="post" className={styles.buttonRow}>
                      <input type="hidden" name="csrf_token" value={csrfToken} />
                      <input type="hidden" name="intent" value="reject" />
                      <input type="hidden" name="id" value={a.id} />
                      <CheckboxField id={`confirm-reject-${a.id}`} name="confirm" label={t("campaigns.testers.rejectConfirm", { username: a.username })} />
                      <Button type="submit" size="sm" variant="danger">
                        {t("campaigns.testers.reject")}
                      </Button>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{t("campaigns.testers.noApplications")}</p>
          )}
        </Panel>
      ) : null}

      <Panel title={t("campaigns.testers.invitations")}>
        <div className={styles.stack}>
          {testers.invitations.length ? (
            <ul className={styles.plainList} aria-label={t("campaigns.testers.invitations")}>
              {testers.invitations.map((invitation) => (
                <li key={invitation.id} className={styles.listRow}>
                  <span>{invitation.username}</span>
                  <Form method="post">
                    <input type="hidden" name="csrf_token" value={csrfToken} />
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={invitation.id} />
                    <Button type="submit" size="sm" variant="quiet" icon={XIcon} aria-label={t("campaigns.testers.revokeNamed", { username: invitation.username })}>
                      {t("campaigns.testers.revoke")}
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{t("campaigns.testers.noInvitations")}</p>
          )}
          {canInvite ? (
            <Form method="post" className={styles.form}>
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <input type="hidden" name="intent" value="invite" />
              <TextField id="invite-username" name="username" label={t("campaigns.testers.username")} hint={t("campaigns.testers.usernameHint")} autoCapitalize="none" spellCheck={false} required />
              <div>
                <Button type="submit" variant="primary" icon={UserPlusIcon}>
                  {t("campaigns.testers.invite")}
                </Button>
              </div>
            </Form>
          ) : (
            <Notice tone="info" title={t(campaign.visibility === "private" ? "campaigns.testers.publishFirst" : "campaigns.testers.publicNoInvites")} />
          )}
        </div>
      </Panel>
    </div>
  );
}
