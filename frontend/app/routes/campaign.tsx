/**
 * Campaign page /p/:project/c/:campaign (WP 3A.2). Server-rendered; drafts and private campaigns
 * exist only for those allowed to see them (404 for everyone else). Former short names redirect.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/campaign";
import { ApplicationPanel } from "~/components/campaigns/ApplicationPanel";
import { BlockNotice } from "~/components/moderation/BlockNotice";
import { Button, ButtonLink } from "~/components/ui/Button";
import { CheckboxField } from "~/components/ui/Form";
import { Chips, FactList, RowList } from "~/components/ui/Data";
import { DownloadSimpleIcon, FlagIcon, LockSimpleIcon, PencilSimpleIcon, ShieldCheckIcon, SignInIcon, SignOutIcon, UserPlusIcon, UsersIcon } from "~/components/ui/icons";
import { Markdown } from "~/components/ui/Markdown";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { CAMPAIGN_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import {
  answersPayload,
  campaignProblem,
  campaignStatusStyleKey,
  canJoinDirectly,
  formatInZone,
  type ApplicationQuestion,
  type Campaign,
  type CampaignLink,
} from "~/lib/campaigns";
import { reportHref } from "~/lib/reports";
import { cacheHeadersFor, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, type Project } from "~/lib/projects";

import styles from "./forms.module.css";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: `Campaign · ${brand.name}` }, { name: "robots", content: "noindex" }];
  const { campaign, project } = loaderData;
  const indexable = campaign.visibility === "public" && campaign.state !== "draft";
  return [
    { title: `${campaign.title} · ${project.name} · ${brand.name}` },
    { name: "description", content: campaign.summary },
    { name: "robots", content: indexable ? "index, follow" : "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  const campaignSlug = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaignSlug)) throw data(null, { status: 404 });
  const [project, result, links] = await Promise.all([
    backendFetch<Project>(request, `/api/v1/projects/${slug}/`),
    backendFetch<Campaign>(request, `/api/v1/projects/${slug}/campaigns/${campaignSlug}/`),
    // Only the team and participants get the links; everyone else gets 404 and sees none.
    backendFetch<CampaignLink[]>(request, `/api/v1/projects/${slug}/campaigns/${campaignSlug}/links/`),
  ]);
  if (project.status !== 200 || !project.data || result.status !== 200 || !result.data) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  const campaign = result.data;
  // Former short names of project or campaign (and wrong letter case) redirect permanently.
  if (project.data.slug !== params.slug || campaign.slug !== params.campaign) {
    throw redirect(`/p/${project.data.slug}/c/${campaign.slug}`, { status: 301 });
  }
  const downloadLinks = links.status === 200 ? (links.data ?? []) : null;
  const isPublic = campaign.visibility === "public" && project.data.visibility === "public" && !campaign.can_edit && downloadLinks === null;
  // Signed-in visitors get a CSRF token for "Join"/"Leave"; anonymous public pages set no cookies.
  const signedIn = Boolean(await getSessionUser(request));
  const csrf = signedIn ? await ensureCsrfToken(request) : null;
  const headers = csrf ? setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) : isPublic ? cacheHeadersFor(request) : privateNoStoreHeaders();
  const search = new URL(request.url).searchParams;
  const joined = search.get("joined") === "1";
  const reported = search.get("reported") === "1";
  const appeal = search.get("appeal");
  const applied = search.get("applied");
  const questions =
    campaign.participation === "approval"
      ? ((await backendFetch<{ questions: ApplicationQuestion[] }>(request, `/api/v1/projects/${slug}/campaigns/${campaignSlug}/questions/`)).data?.questions ?? [])
      : [];
  return data(
    { campaign, project: { slug: project.data.slug, name: project.data.name }, links: downloadLinks,
      signedIn,
      csrfToken: csrf?.token ?? null,
      joined,
      reported,
      appeal,
      questions,
      applied: (applied === "sent" || applied === "withdrawn" ? applied : null) as "sent" | "withdrawn" | null,
    },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug?.toLowerCase();
  const campaignSlug = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaignSlug)) throw data(null, { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const csrfToken = String(form.get("csrf_token") ?? "");
  const headers = privateNoStoreHeaders();
  const api = `/api/v1/projects/${slug}/campaigns/${campaignSlug}/`;
  if (intent === "join") {
    const result = await backendFetch(request, `${api}join/`, { method: "POST", csrfToken });
    if (result.status === 200) throw redirect(`/p/${slug}/c/${campaignSlug}?joined=1`, { headers });
    if (result.status === 404) throw data(null, { status: 404, headers });
    return data({ problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }
  if (intent === "apply") {
    const answers = answersPayload(form);
    const result = await backendFetch(request, `${api}apply/`, { method: "POST", csrfToken, json: { answers } });
    if (result.status === 201) throw redirect(`/p/${slug}/c/${campaignSlug}?applied=sent`, { headers });
    if (result.status === 404) throw data(null, { status: 404, headers });
    return data({ problem: campaignProblem(result.status, result.data), answers }, { status: 400, headers });
  }
  if (intent === "withdraw") {
    const result = await backendFetch(request, `${api}withdraw/`, { method: "POST", csrfToken });
    if (result.status === 204) throw redirect(`/p/${slug}/c/${campaignSlug}?applied=withdrawn`, { headers });
    return data({ problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }
  if (intent === "leave") {
    if (form.get("confirm") !== "on") return data({ problem: "confirmLeave" as const }, { status: 400, headers });
    const result = await backendFetch(request, `${api}leave/`, { method: "POST", csrfToken });
    // Private campaigns are out of reach after leaving: continue on the account page.
    if (result.status === 204) throw redirect("/account?participation=left", { headers });
    return data({ problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }
  throw data(null, { status: 400, headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function CampaignPage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, project, links, signedIn, csrfToken } = loaderData;
  const problem = actionData?.problem ?? null;
  const style = CAMPAIGN_STATUS[campaignStatusStyleKey(campaign.status)];
  const zone = campaign.timezone;
  const sections = [
    { key: "changelog", title: t("campaigns.changelog"), body: campaign.changelog },
    { key: "hardware", title: t("campaigns.hardware"), body: campaign.hardware_requirements },
    { key: "prerequisites", title: t("campaigns.prerequisites"), body: campaign.prerequisites },
    { key: "methodology", title: t("campaigns.methodology"), body: campaign.methodology },
  ].filter((s) => s.body.trim());
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: project.name, to: `/p/${project.slug}` }, { label: t("campaigns.title") }]}
        title={campaign.title}
        subtitle={campaign.summary}
        meta={
          <>
            <StatusPill tone={style.tone} icon={style.icon} label={t(`campaigns.statuses.${campaign.status}`)} />
            {campaign.visibility === "private" ? <StatusPill tone="neutral" icon={LockSimpleIcon} label={t("campaigns.visibilities.private")} /> : null}
            <code>{campaign.version}</code>
          </>
        }
        actions={
          campaign.can_edit ? (
            <>
              <ButtonLink to={`/p/${project.slug}/c/${campaign.slug}/testers`} variant="quiet" icon={UsersIcon}>
                {t("campaigns.testers.title")}
              </ButtonLink>
              <ButtonLink to={`/p/${project.slug}/c/${campaign.slug}/edit`} icon={PencilSimpleIcon}>
                {t("campaigns.edit")}
              </ButtonLink>
            </>
          ) : (
            <ButtonLink to={reportHref({ type: "campaign", project: project.slug, campaign: campaign.slug })} variant="quiet" icon={FlagIcon}>
              {t("reports.action")}
            </ButtonLink>
          )
        }
      />
      {loaderData.joined ? <Notice tone="ok" title={t("campaigns.join.joined")} /> : null}
      {loaderData.reported ? <Notice tone="ok" title={t("reports.thanks")} /> : null}
      {loaderData.appeal ? (
        <Notice tone={loaderData.appeal === "sent" ? "ok" : "danger"} title={t(loaderData.appeal === "sent" ? "moderation.team.sent" : "moderation.team.failed")} />
      ) : null}
      {campaign.moderation ? <BlockNotice info={campaign.moderation} csrfToken={csrfToken} back={`/p/${project.slug}/c/${campaign.slug}`} /> : null}
      {loaderData.applied ? <Notice tone="ok" title={t(`campaigns.apply.done.${loaderData.applied}`)} /> : null}
      {campaign.open_applications ? (
        <Notice tone="info" title={t("campaigns.apply.openForTeam", { count: campaign.open_applications })}>
          <Link to={`/p/${project.slug}/c/${campaign.slug}/testers`} className={styles.textLink}>
            {t("campaigns.apply.review")}
          </Link>
        </Notice>
      ) : null}
      {problem ? <Notice tone="danger" title={t(`campaigns.problem.${problem}`)} /> : null}
      {campaign.is_participant ? (
        <Panel title={t("campaigns.join.participatingTitle")}>
          <Form method="post" className={styles.form}>
            <p>{t("campaigns.join.participatingText")}</p>
            <input type="hidden" name="csrf_token" value={csrfToken ?? ""} />
            <input type="hidden" name="intent" value="leave" />
            <CheckboxField id="confirm-leave" name="confirm" label={t("campaigns.join.leaveConfirm", { title: campaign.title })} />
            <div>
              <Button type="submit" variant="secondary" icon={SignOutIcon}>
                {t("campaigns.join.leave")}
              </Button>
            </div>
          </Form>
        </Panel>
      ) : campaign.participation === "approval" ? (
        <ApplicationPanel
          campaign={campaign}
          questions={loaderData.questions}
          signedIn={signedIn}
          csrfToken={csrfToken}
          loginTo={`/login?next=${encodeURIComponent(`/p/${project.slug}/c/${campaign.slug}`)}`}
          values={actionData && "answers" in actionData ? (actionData.answers as Record<string, string>) : null}
        />
      ) : canJoinDirectly(campaign) ? (
        <Panel title={t("campaigns.join.title")}>
          <div className={styles.stack}>
            <p>{t("campaigns.join.text")}</p>
            {signedIn ? (
              <Form method="post">
                <input type="hidden" name="csrf_token" value={csrfToken ?? ""} />
                <input type="hidden" name="intent" value="join" />
                <Button type="submit" variant="primary" icon={UserPlusIcon}>
                  {t("campaigns.join.join")}
                </Button>
              </Form>
            ) : (
              <div>
                <ButtonLink to={`/login?next=${encodeURIComponent(`/p/${project.slug}/c/${campaign.slug}`)}`} variant="primary" icon={SignInIcon}>
                  {t("campaigns.join.signIn")}
                </ButtonLink>
              </div>
            )}
          </div>
        </Panel>
      ) : null}
      {campaign.can_edit && campaign.state === "draft" ? (
        <Notice tone="info" title={t("campaigns.draftNotice")}>
          {campaign.visibility === "public" ? t("campaigns.publicLockedNotice") : null}
        </Notice>
      ) : null}
      <div className={styles.split}>
        <Panel title={t("campaigns.about")}>
          {campaign.description ? <Markdown>{campaign.description}</Markdown> : <p className={styles.muted}>{t("campaigns.noDescription")}</p>}
        </Panel>
        <Panel title={t("campaigns.details")}>
          <div className={styles.stack}>
            <FactList
              items={[
                { label: t("campaigns.version"), value: <code>{campaign.version}</code> },
                { label: t("campaigns.startsAt"), value: <time dateTime={campaign.starts_at}>{formatInZone(campaign.starts_at, zone)}</time> },
                { label: t("campaigns.endsAt"), value: <time dateTime={campaign.ends_at}>{formatInZone(campaign.ends_at, zone)}</time> },
                { label: t("campaigns.timezone"), value: zone },
                {
                  label: t("campaigns.places"),
                  value: t("campaigns.placesValue", { count: campaign.participant_count, total: campaign.target_testers }),
                },
                { label: t("campaigns.participation"), value: t(`campaigns.participations.${campaign.participation}`) },
              ]}
            />
            {campaign.platforms.length ? (
              <div className={styles.stackTight}>
                <h2 className={styles.subhead}>{t("campaigns.platforms")}</h2>
                <Chips label={t("campaigns.platforms")} items={campaign.platforms.map((p) => p.name)} />
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {links !== null ? (
        <Panel title={t("campaigns.links.title")} flush={links.length > 0}>
          {links.length ? (
            <RowList
              label={t("campaigns.links.title")}
              rows={links.map((link) => ({
                key: link.id,
                icon: DownloadSimpleIcon,
                primary: (
                  <Link to={`/p/${project.slug}/c/${campaign.slug}/download/${link.id}`} className={styles.textLink}>
                    {link.label}
                  </Link>
                ),
                secondary: (
                  <>
                    <code>{link.host}</code>
                    {link.platform ? ` · ${link.platform.name}` : ""}
                  </>
                ),
                trailing: link.in_repository ? <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("campaigns.links.inRepository")} /> : null,
              }))}
            />
          ) : (
            <p className={styles.muted}>{t("campaigns.links.none")}</p>
          )}
        </Panel>
      ) : null}
      {sections.map((section) => (
        <Panel key={section.key} title={section.title}>
          <Markdown>{section.body}</Markdown>
        </Panel>
      ))}
    </div>
  );
}
