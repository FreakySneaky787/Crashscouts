/** New campaign (WP 3A.2): team only, starts as a draft. 404 outside the team. */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/campaign-new";
import { CampaignForm } from "~/components/campaigns/CampaignForm";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { campaignFormEcho, campaignPayload, campaignProblem, type Campaign } from "~/lib/campaigns";
import { loadCampaignFormData } from "~/lib/campaigns.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes, type Project } from "~/lib/projects";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `New campaign · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

async function teamProject(request: Request, slug: string | undefined) {
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const project = await backendFetch<Project>(request, `/api/v1/projects/${slug}/`);
  if (project.status !== 200 || !project.data?.role) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return project.data;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/c/new`)}`, { headers: privateNoStoreHeaders() });
  }
  const project = await teamProject(request, slug);
  if (project.slug !== params.slug) throw redirect(`/p/${project.slug}/c/new`, { headers: privateNoStoreHeaders() });
  const { platforms, timeZones, csrf } = await loadCampaignFormData(request);
  return data(
    { project: { slug: project.slug, name: project.name }, platforms, timeZones, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const headers = privateNoStoreHeaders();
  const form = await request.formData();
  const echo = campaignFormEcho(form);
  const { values, errors } = campaignPayload(form);
  if (Object.keys(errors).length) return data({ values: echo, errors, problem: null }, { status: 400, headers });
  const result = await backendFetch<Campaign>(request, `/api/v1/projects/${slug}/campaigns/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: values,
  });
  if (result.status === 201 && result.data) throw redirect(`/p/${slug}/c/${result.data.slug}`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  if (result.status === 400) return data({ values: echo, errors: projectErrorCodes(result.data), problem: null }, { status: 400, headers });
  return data({ values: echo, errors: {}, problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function CampaignNew({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { project } = loaderData;
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: project.name, to: `/p/${project.slug}` }, { label: t("campaigns.new") }]}
        title={t("campaigns.newTitle")}
        subtitle={t("campaigns.newIntro")}
      />
      {actionData?.problem ? <Notice tone="danger" title={t(`campaigns.problem.${actionData.problem}`)} /> : null}
      <CampaignForm
        csrfToken={loaderData.csrfToken}
        platforms={loaderData.platforms}
        timeZones={loaderData.timeZones}
        values={actionData?.values ?? {}}
        errors={actionData?.errors ?? {}}
        submitLabel={t("campaigns.create")}
        editableAccess
      />
    </div>
  );
}
