/**
 * Testers of a campaign (WP 3A.5): the team invites people by username to private campaigns,
 * sees open invitations (revocable) and current participants. 404 outside the team.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/campaign-testers";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { UserPlusIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { type Campaign } from "~/lib/campaigns";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidUsername } from "~/lib/profile";
import { isValidProjectSlug } from "~/lib/projects";

import styles from "./forms.module.css";

type Testers = {
  invitations: { id: string; username: string; invited_by: string | null; expires_at: string }[];
  participants: { username: string; joined_at: string }[];
};

const RESULTS = ["invited", "revoked"] as const;
const PROBLEMS = [
  "user_not_found",
  "already_team",
  "already_invited",
  "already_participant",
  "removed",
  "too_many_invitations",
  "not_private",
  "not_published",
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
  const [campaign, testers, csrf] = await Promise.all([
    backendFetch<Campaign>(request, api),
    backendFetch<Testers>(request, `${api}invitations/`),
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
  const { campaign, testers, csrfToken, done } = loaderData;
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

      <Panel title={t("campaigns.testers.participants")} aside={t("campaigns.placesValue", { count: testers.participants.length, total: campaign.target_testers })}>
        {testers.participants.length ? (
          <ul className={styles.plainList} aria-label={t("campaigns.testers.participants")}>
            {testers.participants.map((p) => (
              <li key={p.username} className={styles.listRow}>
                <span>{p.username}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t("campaigns.testers.noParticipants")}</p>
        )}
      </Panel>

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
