/** Edit a project (team) and delete it (owner only). 404 for everyone outside the team. */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/project-edit";
import { ProjectForm } from "~/components/projects/ProjectForm";
import { VerificationPanel } from "~/components/projects/VerificationPanel";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextField } from "~/components/ui/Form";
import { ProjectIcon } from "~/components/ui/Data";
import { TrashIcon, UploadSimpleIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes, projectImageSrc, projectPayload, type Project } from "~/lib/projects";
import { loadFormData } from "~/lib/projects.server";
import { isGitHubAuthorizeUrl } from "~/lib/github";
import { verificationErrorKey, verificationOutcome, type VerificationStatus } from "~/lib/verification";

import styles from "./forms.module.css";

const MAX_REQUEST_BYTES = 5 * 1024 * 1024 + 64 * 1024;
const MEDIA_PROBLEMS = ["invalid_image", "alt_text_required", "too_many_screenshots"];

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
  const [{ catalog, licenses, csrf }, verification] = await Promise.all([
    loadFormData(request),
    backendFetch<VerificationStatus>(request, `/api/v1/projects/${slug}/verification/`),
  ]);
  if (verification.status !== 200 || !verification.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const search = new URL(request.url).searchParams;
  const mediaParam = search.get("media");
  const media: "saved" | "removed" | null = mediaParam === "saved" || mediaParam === "removed" ? mediaParam : null;
  return data(
    {
      project: project.data,
      catalog,
      licenses,
      csrfToken: csrf.token,
      media,
      verification: verification.data,
      verificationOutcome: verificationOutcome(search),
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const headers = privateNoStoreHeaders();
  // Uploads are at most 5 MB; larger requests are refused before the body is read.
  const length = Number(request.headers.get("Content-Length") ?? "NaN");
  if (!Number.isFinite(length) || length > MAX_REQUEST_BYTES) {
    return data({ values: null, errors: {}, problem: "invalid_image" }, { status: 413, headers });
  }
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = form.get("intent");
  const base = `/api/v1/projects/${slug}`;

  if (intent === "logo" || intent === "screenshot-add") {
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) return data({ values: null, errors: {}, problem: "invalid_image" }, { status: 400, headers });
    const upload = new FormData();
    upload.set("image", file, file.name);
    if (intent === "screenshot-add") upload.set("alt_text", String(form.get("alt_text") ?? ""));
    const result = await backendFetch(request, intent === "logo" ? `${base}/logo/` : `${base}/screenshots/`, {
      method: intent === "logo" ? "PUT" : "POST",
      csrfToken,
      form: upload,
    });
    if (result.status === 204 || result.status === 201) throw redirect(`/p/${slug}/edit?media=saved`, { headers });
    const code = (result.data as { code?: string } | null)?.code;
    const problem = result.status === 429 ? "rateLimited" : code && MEDIA_PROBLEMS.includes(code) ? code : "generic";
    return data({ values: null, errors: {}, problem }, { status: 400, headers });
  }
  if (intent === "logo-remove" || intent === "screenshot-remove") {
    const key = String(form.get("key") ?? "");
    if (intent === "screenshot-remove" && !isUuid(key)) throw data(null, { status: 404 });
    const path = intent === "logo-remove" ? `${base}/logo/` : `${base}/screenshots/${key}/`;
    const result = await backendFetch(request, path, { method: "DELETE", csrfToken });
    if (result.status === 204) throw redirect(`/p/${slug}/edit?media=removed`, { headers });
    return data({ values: null, errors: {}, problem: "generic" }, { status: 400, headers });
  }

  if (intent === "verify-file" || intent === "verify-github") {
    const result = await backendFetch<{ code?: string; authorize_url?: string }>(
      request,
      `${base}/verification/${intent === "verify-file" ? "file" : "github"}/`,
      { method: "POST", csrfToken },
    );
    // The GitHub way stores a one-time value in the session: pass the refreshed cookie on.
    const verifyHeaders = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
    const authorizeUrl = result.data?.authorize_url;
    if (intent === "verify-github" && result.status === 200 && isGitHubAuthorizeUrl(authorizeUrl)) {
      throw redirect(authorizeUrl, { headers: verifyHeaders });
    }
    if (intent === "verify-file" && result.status === 200) throw redirect(`/p/${slug}/edit?verification=verified`, { headers: verifyHeaders });
    if (result.status === 404) throw data(null, { status: 404, headers });
    const error = verificationErrorKey(result.data?.code);
    throw redirect(`/p/${slug}/edit?verification_error=${error}`, { headers: verifyHeaders });
  }

  if (intent === "delete") {
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
  const mediaProblem = actionData?.problem && MEDIA_PROBLEMS.concat("rateLimited").includes(actionData.problem) ? actionData.problem : null;
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
        problem={actionData?.problem && !deleteProblem && !mediaProblem ? actionData.problem : null}
        submitLabel={t("projects.save")}
        intent="save"
      />
      <VerificationPanel status={loaderData.verification} csrfToken={loaderData.csrfToken} outcome={loaderData.verificationOutcome} />
      <Panel title={t("projects.media")}>
        <div className={styles.stack}>
          {loaderData.media ? <Notice tone="ok" title={t(`projects.mediaDone.${loaderData.media}`)} /> : null}
          {mediaProblem ? <Notice tone="danger" title={t(`projects.mediaProblem.${mediaProblem as "invalid_image"}`)} /> : null}
          <div className={styles.avatarRow}>
            <ProjectIcon name={project.name} id={project.slug} size="lg" src={projectImageSrc(project.logo_key)} />
            <div className={styles.stack}>
              <Form method="post" encType="multipart/form-data" className={styles.form}>
                <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                <input type="hidden" name="intent" value="logo" />
                <TextField id="logo" name="image" type="file" accept="image/png,image/jpeg,image/webp" label={t("projects.logo")} hint={t("projects.logoHint")} required />
                <div>
                  <Button type="submit" icon={UploadSimpleIcon}>
                    {t("projects.uploadLogo")}
                  </Button>
                </div>
              </Form>
              {project.logo_key ? (
                <Form method="post">
                  <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                  <input type="hidden" name="intent" value="logo-remove" />
                  <Button type="submit" variant="quiet" size="sm" icon={XIcon}>
                    {t("projects.removeLogo")}
                  </Button>
                </Form>
              ) : null}
            </div>
          </div>
          {project.screenshots.length ? (
            <ul className={styles.gallery} aria-label={t("projects.screenshots")}>
              {project.screenshots.map((shot) => (
                <li key={shot.key} className={styles.stackTight}>
                  <img src={projectImageSrc(shot.key)!} alt={shot.alt_text} width={shot.width} height={shot.height} loading="lazy" className={styles.screenshot} />
                  <Form method="post">
                    <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                    <input type="hidden" name="intent" value="screenshot-remove" />
                    <input type="hidden" name="key" value={shot.key} />
                    <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("projects.removeScreenshotNamed", { name: shot.alt_text })}>
                      {t("projects.removeScreenshot")}
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          ) : null}
          <Form method="post" encType="multipart/form-data" className={styles.form}>
            <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
            <input type="hidden" name="intent" value="screenshot-add" />
            <TextField id="screenshot" name="image" type="file" accept="image/png,image/jpeg,image/webp" label={t("projects.screenshot")} hint={t("projects.screenshotHint")} required />
            <TextField id="screenshot-alt" name="alt_text" label={t("projects.altText")} hint={t("projects.altTextHint")} maxLength={200} required />
            <div>
              <Button type="submit" icon={UploadSimpleIcon}>
                {t("projects.addScreenshot")}
              </Button>
            </div>
          </Form>
        </div>
      </Panel>
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
