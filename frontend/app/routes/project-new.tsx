import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/project-new";
import { ProjectForm } from "~/components/projects/ProjectForm";
import { PageHeader } from "~/components/ui/PageHeader";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { projectErrorCodes, projectPayload, type Project } from "~/lib/projects";
import { loadFormData } from "~/lib/projects.server";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `New project · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) {
    throw redirect("/login?next=%2Fprojects%2Fnew", { headers: privateNoStoreHeaders() });
  }
  const { catalog, licenses, csrf } = await loadFormData(request);
  return data(
    { catalog, licenses, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values = projectPayload(form);
  const result = await backendFetch<Project | Record<string, string[]> | { detail?: string }>(request, "/api/v1/projects/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: values,
  });
  const headers = privateNoStoreHeaders();
  if (result.status === 201) throw redirect(`/p/${(result.data as Project).slug}`, { headers });
  if (result.status === 400) return data({ values, errors: projectErrorCodes(result.data), problem: null }, { status: 400, headers });
  const unconfirmed = (result.data as { detail?: string } | null)?.detail === "email_unconfirmed";
  const problem = result.status === 429 ? "rateLimited" : unconfirmed ? "emailUnconfirmed" : result.status === 403 ? "forbidden" : "generic";
  return data({ values, errors: {}, problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function ProjectNew({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.stack}>
      <PageHeader title={t("projects.newTitle")} subtitle={t("projects.newIntro")} />
      <ProjectForm
        csrfToken={loaderData.csrfToken}
        catalog={loaderData.catalog}
        licenses={loaderData.licenses}
        values={actionData?.values ?? {}}
        errors={actionData?.errors ?? {}}
        problem={actionData?.problem ?? null}
        submitLabel={t("projects.create")}
      />
    </div>
  );
}
