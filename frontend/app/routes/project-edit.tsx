/** Edit a project (team) and delete it (owner only). 404 for everyone outside the team. */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/project-edit";
import { ProjectForm } from "~/components/projects/ProjectForm";
import { Button } from "~/components/ui/Button";
import { CheckboxField } from "~/components/ui/Form";
import { TrashIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes, projectPayload, type Project } from "~/lib/projects";
import { loadFormData } from "~/lib/projects.server";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Edit project · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/edit`)}`, { headers: privateNoStoreHeaders() });
  }
  const project = await backendFetch<Project>(request, `/api/v1/projects/${slug}/`);
  if (project.status !== 200 || !project.data?.role) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  if (project.data.slug !== params.slug) throw redirect(`/p/${project.data.slug}/edit`, { headers: privateNoStoreHeaders() });
  const { catalog, licenses, csrf } = await loadFormData(request);
  return data(
    { project: project.data, catalog, licenses, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const headers = privateNoStoreHeaders();

  if (form.get("intent") === "delete") {
    if (form.get("confirm") !== "on") return data({ values: null, errors: {}, problem: "confirmDelete" }, { status: 400, headers });
    const result = await backendFetch(request, `/api/v1/projects/${slug}/`, { method: "DELETE", csrfToken });
    if (result.status === 204) throw redirect("/account?project=deleted", { headers });
    return data({ values: null, errors: {}, problem: result.status === 403 ? "ownerOnly" : "generic" }, { status: 400, headers });
  }

  const values = projectPayload(form);
  const result = await backendFetch<Project>(request, `/api/v1/projects/${slug}/`, { method: "PATCH", csrfToken, json: values });
  if (result.status === 200 && result.data) throw redirect(`/p/${result.data.slug}`, { headers });
  if (result.status === 400) return data({ values, errors: projectErrorCodes(result.data), problem: null }, { status: 400, headers });
  return data({ values, errors: {}, problem: result.status === 403 ? "forbidden" : "generic" }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function ProjectEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { project } = loaderData;
  const current = {
    slug: project.slug,
    name: project.name,
    summary: project.summary,
    description: project.description,
    status: project.status,
    visibility: project.visibility,
    license: project.license.spdx_id,
    repository_url: project.repository_url,
    categories: project.categories.map((i) => i.slug),
    platforms: project.platforms.map((i) => i.slug),
    languages: project.languages.map((i) => i.slug),
  };
  const deleteProblem = actionData?.problem === "confirmDelete" || actionData?.problem === "ownerOnly" ? actionData.problem : null;
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: project.name, to: `/p/${project.slug}` }, { label: t("projects.edit") }]}
        title={t("projects.editTitle", { name: project.name })}
      />
      <ProjectForm
        csrfToken={loaderData.csrfToken}
        catalog={loaderData.catalog}
        licenses={loaderData.licenses}
        values={actionData?.values ?? current}
        errors={actionData?.errors ?? {}}
        problem={actionData?.problem && !deleteProblem ? actionData.problem : null}
        submitLabel={t("projects.save")}
        intent="save"
      />
      {project.role === "owner" ? (
        <Panel title={t("projects.deleteTitle")}>
          <Form method="post" className={styles.form}>
            {deleteProblem ? <Notice tone="danger" title={t(`projects.problem.${deleteProblem}`)} /> : null}
            <p>{t("projects.deleteText")}</p>
            <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
            <input type="hidden" name="intent" value="delete" />
            <CheckboxField id="confirm-delete" name="confirm" label={t("projects.deleteConfirm", { name: project.name })} />
            <div>
              <Button type="submit" variant="danger" icon={TrashIcon}>
                {t("projects.delete")}
              </Button>
            </div>
          </Form>
        </Panel>
      ) : null}
    </div>
  );
}
