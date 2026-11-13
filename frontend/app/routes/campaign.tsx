/**
 * Campaign page /p/:project/c/:campaign (WP 3A.2). Server-rendered; drafts and private campaigns
 * exist only for those allowed to see them (404 for everyone else). Former short names redirect.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/campaign";
import { ButtonLink } from "~/components/ui/Button";
import { Chips, FactList } from "~/components/ui/Data";
import { LockSimpleIcon, PencilSimpleIcon } from "~/components/ui/icons";
import { Markdown } from "~/components/ui/Markdown";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { CAMPAIGN_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { campaignStatusStyleKey, formatInZone, type Campaign } from "~/lib/campaigns";
import { cacheHeadersFor, privateNoStoreHeaders } from "~/lib/http";
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
  const [project, result] = await Promise.all([
    backendFetch<Project>(request, `/api/v1/projects/${slug}/`),
    backendFetch<Campaign>(request, `/api/v1/projects/${slug}/campaigns/${campaignSlug}/`),
  ]);
  if (project.status !== 200 || !project.data || result.status !== 200 || !result.data) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  const campaign = result.data;
  // Former short names of project or campaign (and wrong letter case) redirect permanently.
  if (project.data.slug !== params.slug || campaign.slug !== params.campaign) {
    throw redirect(`/p/${project.data.slug}/c/${campaign.slug}`, { status: 301 });
  }
  const isPublic = campaign.visibility === "public" && project.data.visibility === "public" && !campaign.can_edit;
  const headers = isPublic ? cacheHeadersFor(request) : privateNoStoreHeaders();
  return data({ campaign, project: { slug: project.data.slug, name: project.data.name } }, { headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function CampaignPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, project } = loaderData;
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
            <ButtonLink to={`/p/${project.slug}/c/${campaign.slug}/edit`} icon={PencilSimpleIcon}>
              {t("campaigns.edit")}
            </ButtonLink>
          ) : null
        }
      />
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
      {sections.map((section) => (
        <Panel key={section.key} title={section.title}>
          <Markdown>{section.body}</Markdown>
        </Panel>
      ))}
    </div>
  );
}
