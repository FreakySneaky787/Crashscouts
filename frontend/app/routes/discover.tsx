/**
 * Discover (WP 6.3, ADR 0025): public projects and test campaigns with search, filters and fair
 * sorting (recently active or newest, never by popularity). "Open source only" is preselected
 * (owner's decision). All controls are links or a GET form: works without JavaScript, every
 * view has a shareable address. Plain lists are indexable; searches and filters are not.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link } from "react-router";

import type { Route } from "./+types/discover";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Chips, ProjectIcon } from "~/components/ui/Data";
import { EmptyState } from "~/components/ui/EmptyState";
import { CheckboxField, SelectField, TextField } from "~/components/ui/Form";
import { MagnifyingGlassIcon, ShieldCheckIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { CAMPAIGN_STATUS, PROJECT_STATUS } from "~/components/ui/statuses";
import { TabNav } from "~/components/ui/TabNav";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { TEST_METHODS, campaignStatusStyleKey, formatInZone } from "~/lib/campaigns";
import {
  discoverApiQuery,
  discoverHref,
  isFiltered,
  readDiscoverParams,
  type DiscoverCampaign,
  type DiscoverPage,
  type DiscoverProject,
} from "~/lib/discover";
import { cacheHeadersFor } from "~/lib/http";
import type { Catalog } from "~/lib/profile";
import { PROJECT_STATUSES, projectImageSrc, statusLabel } from "~/lib/projects";

import styles from "./discover.module.css";

type FullCatalog = Catalog & { languages: { slug: string; name: string }[]; software_types: { slug: string; name: string }[] };

export function meta({ loaderData }: Route.MetaArgs) {
  const tags = [
    { title: `Discover · ${brand.name}` },
    { name: "description", content: "Find open-source projects and public test campaigns." },
  ];
  return loaderData?.filtered ? [...tags, { name: "robots", content: "noindex" }] : tags;
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = readDiscoverParams(new URL(request.url).searchParams);
  const endpoint = params.tab === "campaigns" ? "campaigns" : "projects";
  const query = discoverApiQuery(params);
  const [results, catalog] = await Promise.all([
    backendFetch<DiscoverPage<DiscoverProject | DiscoverCampaign>>(request, `/api/v1/discover/${endpoint}/${query ? `?${query}` : ""}`),
    backendFetch<FullCatalog>(request, "/api/v1/catalog/"),
  ]);
  const page = results.status === 200 && results.data ? results.data : { results: [], total: 0, page: 1, pages: 1 };
  return data(
    {
      params,
      page,
      rateLimited: results.status === 429,
      catalog: catalog.data ?? { categories: [], platforms: [], skills: [], languages: [], software_types: [] },
      filtered: isFiltered(params),
    },
    { headers: cacheHeadersFor(request) },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Discover({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { params, page, catalog } = loaderData;
  const any = { value: "", label: t("discover.any") };
  const options = (items: { slug: string; name: string }[]) => [any, ...items.map((i) => ({ value: i.slug, label: i.name }))];
  const campaigns = params.tab === "campaigns";

  return (
    <div className={styles.stack}>
      <PageHeader title={t("discover.title")} subtitle={t("discover.intro")} />
      <TabNav
        label={t("discover.tabs")}
        current={params.tab}
        items={[
          { key: "projects", label: t("discover.projects"), to: discoverHref(params, { tab: "projects", page: 1, method: "", free_places: false }) },
          { key: "campaigns", label: t("discover.campaigns"), to: discoverHref(params, { tab: "campaigns", page: 1, status: "", has_campaign: false }) },
        ]}
      />
      <Panel title={t("discover.filters")}>
        <Form method="get" className={styles.filters} role="search">
          {campaigns ? <input type="hidden" name="tab" value="campaigns" /> : null}
          <div className={styles.searchRow}>
            <TextField id="discover-q" name="q" type="search" label={t("discover.search")} hint={t("discover.searchHint")} maxLength={200} defaultValue={params.q} />
          </div>
          <SelectField id="discover-licence" name="open_source" label={t("discover.licence")} defaultValue={params.open_source} options={[{ value: "", label: t("discover.openSourceOnly") }, { value: "all", label: t("discover.allLicences") }]} />
          <SelectField id="discover-sort" name="sort" label={t("discover.sort")} defaultValue={params.sort} options={[{ value: "", label: t("discover.sortActive") }, { value: "new", label: t("discover.sortNew") }]} />
          <SelectField id="discover-platform" name="platform" label={t("discover.platform")} defaultValue={params.platform} options={options(catalog.platforms)} />
          <SelectField id="discover-software-type" name="software_type" label={t("discover.softwareType")} defaultValue={params.software_type} options={options(catalog.software_types)} />
          <SelectField id="discover-category" name="category" label={t("discover.category")} defaultValue={params.category} options={options(catalog.categories)} />
          <SelectField id="discover-language" name="language" label={t("discover.language")} defaultValue={params.language} options={options(catalog.languages)} />
          {campaigns ? (
            <>
              <SelectField id="discover-method" name="method" label={t("discover.method")} defaultValue={params.method} options={[any, ...TEST_METHODS.map((m) => ({ value: m, label: t(`campaigns.methods.${m}`) }))]} />
              <CheckboxField id="discover-free" name="free_places" value="1" label={t("discover.freePlaces")} defaultChecked={params.free_places} />
            </>
          ) : (
            <>
              <SelectField id="discover-status" name="status" label={t("discover.status")} defaultValue={params.status} options={[any, ...PROJECT_STATUSES.map((s) => ({ value: s, label: t(`projects.statuses.${s}`) }))]} />
              <CheckboxField id="discover-has-campaign" name="has_campaign" value="1" label={t("discover.hasCampaign")} defaultChecked={params.has_campaign} />
            </>
          )}
          <div className={styles.buttons}>
            <Button type="submit" variant="primary" icon={MagnifyingGlassIcon}>
              {t("discover.apply")}
            </Button>
            {loaderData.filtered ? (
              <ButtonLink to={campaigns ? "/discover?tab=campaigns" : "/discover"} variant="quiet">
                {t("discover.reset")}
              </ButtonLink>
            ) : null}
          </div>
        </Form>
      </Panel>

      <Panel title={campaigns ? t("discover.campaigns") : t("discover.projects")} aside={t("discover.results", { count: page.total })}>
        {page.results.length ? (
          <ul className={styles.results} aria-label={campaigns ? t("discover.campaigns") : t("discover.projects")}>
            {campaigns
              ? (page.results as DiscoverCampaign[]).map((c) => <CampaignCard key={`${c.project}/${c.slug}`} campaign={c} />)
              : (page.results as DiscoverProject[]).map((p) => <ProjectCard key={p.slug} project={p} />)}
          </ul>
        ) : (
          <EmptyState kind="empty" title={t(campaigns ? "discover.noCampaigns" : "discover.noProjects")}>
            {campaigns && !loaderData.filtered ? t("discover.campaignsLocked") : t("discover.noProjectsText")}
          </EmptyState>
        )}
        {page.pages > 1 ? (
          <nav aria-label={t("discover.pagination")} className={styles.pagination}>
            {page.page > 1 ? <Link to={discoverHref(params, { page: page.page - 1 })}>{t("discover.previous")}</Link> : <span />}
            <span className={styles.muted}>{t("discover.page", { page: page.page, pages: page.pages })}</span>
            {page.page < page.pages ? <Link to={discoverHref(params, { page: page.page + 1 })}>{t("discover.next")}</Link> : <span />}
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}

function OpenSourcePill({ openSource }: { openSource: boolean }) {
  const { t } = useTranslation();
  return openSource ? (
    <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("discover.openSource")} />
  ) : (
    <StatusPill tone="neutral" label={t("discover.notOpenSource")} />
  );
}

function ProjectCard({ project }: { project: DiscoverProject }) {
  const { t } = useTranslation();
  const status = PROJECT_STATUS[statusLabel(project.status)];
  return (
    <li className={styles.card}>
      <ProjectIcon name={project.name} id={project.slug} src={projectImageSrc(project.logo_key)} />
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>
          <Link to={`/p/${project.slug}`}>{project.name}</Link>
        </h2>
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

function CampaignCard({ campaign }: { campaign: DiscoverCampaign }) {
  const { t } = useTranslation();
  const status = CAMPAIGN_STATUS[campaignStatusStyleKey(campaign.status)];
  return (
    <li className={styles.card}>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>
          <Link to={`/p/${campaign.project}/c/${campaign.slug}`}>{campaign.title}</Link>
        </h2>
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
