/** Project page /p/:slug – server-rendered with link previews; private projects only for the team. */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/project";
import { Chips, FactList, ProjectIcon } from "~/components/ui/Data";
import { ArrowSquareOutIcon, LockSimpleIcon, PencilSimpleIcon, ShieldCheckIcon, UsersIcon } from "~/components/ui/icons";
import { ButtonLink } from "~/components/ui/Button";
import { Markdown } from "~/components/ui/Markdown";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { PROJECT_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { cacheHeadersFor, privateNoStoreHeaders } from "~/lib/http";
import { isValidProjectSlug, projectImageSrc, statusLabel, type Project } from "~/lib/projects";

import styles from "./forms.module.css";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: `Project · ${brand.name}` }, { name: "robots", content: "noindex" }];
  const { project, url } = loaderData;
  const isPublic = project.visibility === "public";
  return [
    { title: `${project.name} · ${brand.name}` },
    { name: "description", content: project.summary },
    { name: "robots", content: isPublic ? "index, follow" : "noindex" },
    ...(isPublic
      ? [
          { property: "og:type", content: "website" },
          { property: "og:title", content: project.name },
          { property: "og:description", content: project.summary },
          { property: "og:url", content: url },
          { property: "og:site_name", content: brand.name },
          { name: "twitter:card", content: "summary" },
        ]
      : []),
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const result = await backendFetch<Project>(request, `/api/v1/projects/${slug}/`);
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const project = result.data;
  // Former short names (and wrong letter case) redirect permanently to the current one.
  if (project.slug !== params.slug) throw redirect(`/p/${project.slug}`, { status: 301 });
  const url = new URL(`/p/${project.slug}`, request.url).toString();
  const headers = project.visibility === "public" && !project.role ? cacheHeadersFor(request) : privateNoStoreHeaders();
  return data({ project, url }, { headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function ProjectPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { project } = loaderData;
  const status = statusLabel(project.status);
  const owner = project.team.find((m) => m.role === "owner");
  return (
    <div className={styles.stack}>
      <PageHeader
        title={project.name}
        subtitle={project.summary}
        leading={<ProjectIcon name={project.name} id={project.slug} size="lg" src={projectImageSrc(project.logo_key)} />}
        meta={
          <>
            <StatusPill tone={PROJECT_STATUS[status].tone} label={t(`projects.statuses.${project.status}`)} />
            <StatusPill tone={project.open_source ? "ok" : "neutral"} label={project.open_source ? t("projects.openSource") : t("projects.notOpenSource")} />
            {project.visibility === "private" ? <StatusPill tone="neutral" icon={LockSimpleIcon} label={t("projects.visibilities.private")} /> : null}
            {project.verification_method ? <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("verification.badge")} /> : null}
          </>
        }
        actions={
          project.role ? (
            <>
              <ButtonLink to={`/p/${project.slug}/team`} variant="quiet" icon={UsersIcon}>
                {t("team.title")}
              </ButtonLink>
              <ButtonLink to={`/p/${project.slug}/edit`} icon={PencilSimpleIcon}>
                {t("projects.edit")}
              </ButtonLink>
            </>
          ) : null
        }
      />
      {project.screenshots.length ? (
        <Panel title={t("projects.screenshots")}>
          <ul className={styles.gallery} aria-label={t("projects.screenshots")}>
            {project.screenshots.map((shot) => (
              <li key={shot.key}>
                <img src={projectImageSrc(shot.key)!} alt={shot.alt_text} width={shot.width} height={shot.height} loading="lazy" className={styles.screenshot} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <div className={styles.split}>
        <Panel title={t("projects.about")}>
          {project.description ? <Markdown>{project.description}</Markdown> : <p className={styles.muted}>{t("projects.noDescription")}</p>}
        </Panel>
        <Panel title={t("projects.details")}>
          <div className={styles.stack}>
            <FactList
              items={[
                { label: t("projects.license"), value: <code>{project.license.spdx_id === "LicenseRef-Proprietary" ? t("projects.proprietary") : project.license.spdx_id}</code> },
                ...(owner ? [{ label: t("projects.owner"), value: owner.username }] : []),
                ...(project.repository_url
                  ? [
                      {
                        label: t("projects.repository"),
                        value: (
                          <a href={project.repository_url} rel="nofollow ugc noopener noreferrer">
                            {new URL(project.repository_url).host}
                            <ArrowSquareOutIcon aria-hidden="true" className={styles.inlineIcon} />
                          </a>
                        ),
                      },
                      {
                        label: t("verification.factLabel"),
                        value: project.verification_method ? t("verification.badgeExplained") : t("verification.badgeMissing"),
                      },
                    ]
                  : []),
              ]}
            />
            {(["platforms", "languages", "categories"] as const).map((field) =>
              project[field].length ? (
                <div key={field} className={styles.stackTight}>
                  <h2 className={styles.subhead}>{t(`projects.${field}`)}</h2>
                  <Chips label={t(`projects.${field}`)} items={project[field].map((i) => i.name)} />
                </div>
              ) : null,
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
