/**
 * Result cards of Discover (WP 6.3), also used on the home page (WP 8.9). `headingLevel` keeps
 * the heading order right where the list sits under a section heading.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Chips, ProjectIcon } from "~/components/ui/Data";
import { ShieldCheckIcon } from "~/components/ui/icons";
import { StatusPill } from "~/components/ui/StatusPill";
import { CAMPAIGN_STATUS, PROJECT_STATUS } from "~/components/ui/statuses";
import { campaignStatusStyleKey, formatInZone } from "~/lib/campaigns";
import type { DiscoverCampaign, DiscoverProject } from "~/lib/discover";
import { projectImageSrc, statusLabel } from "~/lib/projects";

import styles from "./DiscoverCards.module.css";

export function OpenSourcePill({ openSource }: { openSource: boolean }) {
  const { t } = useTranslation();
  return openSource ? (
    <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("discover.openSource")} />
  ) : (
    <StatusPill tone="neutral" label={t("discover.notOpenSource")} />
  );
}

export function ProjectCard({ project, headingLevel = 2 }: { project: DiscoverProject; headingLevel?: 2 | 3 }) {
  const { t } = useTranslation();
  const status = PROJECT_STATUS[statusLabel(project.status)];
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <li className={styles.card}>
      <ProjectIcon name={project.name} id={project.slug} src={projectImageSrc(project.logo_key)} />
      <div className={styles.cardBody}>
        <Heading className={styles.cardTitle}>
          <Link to={`/p/${project.slug}`}>{project.name}</Link>
        </Heading>
        <p className={styles.muted}>{project.summary}</p>
        <div className={styles.pills}>
          <OpenSourcePill openSource={project.open_source} />
          <StatusPill tone={status.tone} label={t(`projects.statuses.${project.status}`)} />
          {project.active_campaigns ? <span className={styles.muted}>{t("discover.activeCampaigns", { count: project.active_campaigns })}</span> : null}
        </div>
        {project.software_types.length || project.platforms.length ? (
          <Chips label={t("discover.platform")} items={[...project.software_types, ...project.platforms].map((i) => i.name)} />
        ) : null}
      </div>
    </li>
  );
}

export function CampaignCard({ campaign, headingLevel = 2 }: { campaign: DiscoverCampaign; headingLevel?: 2 | 3 }) {
  const { t } = useTranslation();
  const status = CAMPAIGN_STATUS[campaignStatusStyleKey(campaign.status)];
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <li className={styles.card}>
      <div className={styles.cardBody}>
        <Heading className={styles.cardTitle}>
          <Link to={`/p/${campaign.project}/c/${campaign.slug}`}>{campaign.title}</Link>
        </Heading>
        <p className={styles.muted}>
          <Link to={`/p/${campaign.project}`}>{campaign.project_name}</Link> · {campaign.summary}
        </p>
        <div className={styles.pills}>
          <StatusPill tone={status.tone} icon={status.icon} label={t(`campaigns.statuses.${campaign.status}`)} />
          <OpenSourcePill openSource={campaign.open_source} />
          <span className={styles.muted}>
            {t(`campaigns.methods.${campaign.method}`)} · {t("discover.places", { count: campaign.participants, total: campaign.target_testers })} ·{" "}
            <time dateTime={campaign.starts_at}>{formatInZone(campaign.starts_at, campaign.timezone)}</time> –{" "}
            <time dateTime={campaign.ends_at}>{formatInZone(campaign.ends_at, campaign.timezone)}</time>
          </span>
        </div>
        {campaign.platforms.length ? <Chips label={t("discover.platform")} items={campaign.platforms.map((i) => i.name)} /> : null}
      </div>
    </li>
  );
}
