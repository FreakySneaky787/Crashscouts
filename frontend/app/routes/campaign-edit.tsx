/**
 * Edit a campaign (WP 3A.2): details, publish, complete, cancel, delete drafts. Team only; 404
 * for everyone else. Publishing a public campaign is refused by the server while the security
 * gate (phase 3B) is closed; the page says so.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/campaign-edit";
import { CampaignForm } from "~/components/campaigns/CampaignForm";
import { LinksPanel } from "~/components/campaigns/LinksPanel";
import { QuestionsPanel } from "~/components/campaigns/QuestionsPanel";
import { TasksPanel, type TaskDone } from "~/components/campaigns/TasksPanel";
import { Button } from "~/components/ui/Button";
import { CheckboxField } from "~/components/ui/Form";
import { CheckCircleIcon, PaperPlaneTiltIcon, TrashIcon, XCircleIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import {
  campaignFormEcho,
  campaignFormValues,
  campaignPayload,
  campaignProblem,
  linkPayload,
  questionPayload,
  taskPayload,
  type ApplicationQuestion,
  type Campaign,
  type CampaignLink,
  type CampaignTasks,
} from "~/lib/campaigns";
import { loadCampaignFormData } from "~/lib/campaigns.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes, type Project } from "~/lib/projects";

import styles from "./forms.module.css";

const ACTIONS = { publish: "publish", complete: "complete", cancel: "cancel" } as const;
const TASK_DONE = ["added", "saved", "removed", "hidden"] as const;

function taskDoneFrom(done: string | null): TaskDone | null {
  const value = done?.startsWith("task-") ? done.slice("task-".length) : "";
  return (TASK_DONE as readonly string[]).includes(value) ? (value as TaskDone) : null;
}

export function meta(_: Route.MetaArgs) {
  return [{ title: `Edit campaign · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function slugs(params: { slug?: string; campaign?: string }) {
  const slug = params.slug?.toLowerCase();
  const campaign = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaign)) throw data(null, { status: 404 });
  return { slug, campaign, api: `/api/v1/projects/${slug}/campaigns/${campaign}/` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { slug, campaign: campaignSlug, api } = slugs(params);
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/c/${campaignSlug}/edit`)}`, { headers: privateNoStoreHeaders() });
  }
  const [project, campaign] = await Promise.all([backendFetch<Project>(request, `/api/v1/projects/${slug}/`), backendFetch<Campaign>(request, api)]);
  if (project.status !== 200 || !project.data || campaign.status !== 200 || !campaign.data?.can_edit) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  if (project.data.slug !== params.slug || campaign.data.slug !== params.campaign) {
    throw redirect(`/p/${project.data.slug}/c/${campaign.data.slug}/edit`, { headers: privateNoStoreHeaders() });
  }
  const [{ platforms, timeZones, csrf }, links, questions, tasks] = await Promise.all([
    loadCampaignFormData(request),
    backendFetch<CampaignLink[]>(request, `${api}links/`),
    backendFetch<{ questions: ApplicationQuestion[] }>(request, `${api}questions/`),
    backendFetch<CampaignTasks>(request, `${api}tasks/`),
  ]);
  const done = new URL(request.url).searchParams.get("done");
  return data(
    {
      project: { slug: project.data.slug, name: project.data.name },
      campaign: campaign.data,
      platforms,
      timeZones,
      csrfToken: csrf.token,
      saved: done === "saved",
      links: links.data ?? [],
      questions: questions.data?.questions ?? [],
      linkDone: done === "link-added" ? ("added" as const) : done === "link-removed" ? ("removed" as const) : null,
      tasks: tasks.data?.tasks ?? [],
      taskDone: taskDoneFrom(done),
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { slug, api } = slugs(params);
  const headers = privateNoStoreHeaders();
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");

  if (intent === "cancel" && form.get("confirm") !== "on") {
    return data({ values: null, errors: {}, problem: "confirmCancel" as const }, { status: 400, headers });
  }
  if (intent in ACTIONS) {
    const result = await backendFetch<Campaign>(request, `${api}${ACTIONS[intent as keyof typeof ACTIONS]}/`, { method: "POST", csrfToken });
    if (result.status === 200 && result.data) throw redirect(`/p/${slug}/c/${result.data.slug}`, { headers });
    if (result.status === 404) throw data(null, { status: 404, headers });
    return data({ values: null, errors: {}, problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }
  if (intent === "question-add" || intent === "question-template" || intent === "question-remove") {
    let result;
    if (intent === "question-add") {
      result = await backendFetch(request, `${api}questions/`, { method: "POST", csrfToken, json: questionPayload(form) });
    } else if (intent === "question-template") {
      const key = String(form.get("template") ?? "");
      if (!/^[a-z_]{1,40}$/.test(key)) throw data(null, { status: 400, headers });
      result = await backendFetch(request, `${api}questions/template/${key}/`, { method: "POST", csrfToken });
    } else {
      const id = String(form.get("question") ?? "");
      if (!isUuid(id)) throw data(null, { status: 404, headers });
      result = await backendFetch(request, `${api}questions/${id}/`, { method: "DELETE", csrfToken });
    }
    if (result.status === 201 || result.status === 204) throw redirect(`/p/${slug}/c/${params.campaign}/edit?done=questions`, { headers });
    if (result.status === 404) throw data(null, { status: 404, headers });
    const body = result.data as Record<string, unknown> | null;
    const questionErrors = body && typeof body.code === "string" ? { code: body.code } : projectErrorCodes(body);
    return data({ values: null, errors: {}, problem: null, questionErrors }, { status: 400, headers });
  }
  if (intent === "task-add" || intent === "task-change" || intent === "task-move" || intent === "task-remove") {
    const back = (done: TaskDone) => redirect(`/p/${slug}/c/${params.campaign}/edit?done=task-${done}#tasks`, { headers });
    const id = String(form.get("task") ?? "");
    if (intent !== "task-add" && !isUuid(id)) throw data(null, { status: 404, headers });
    let result;
    if (intent === "task-add") {
      result = await backendFetch(request, `${api}tasks/`, { method: "POST", csrfToken, json: taskPayload(form) });
      if (result.status === 201) throw back("added");
    } else if (intent === "task-change") {
      result = await backendFetch(request, `${api}tasks/${id}/`, { method: "PATCH", csrfToken, json: taskPayload(form) });
      if (result.status === 200) throw back("saved");
    } else if (intent === "task-move") {
      const direction = form.get("direction") === "up" ? "up" : "down";
      result = await backendFetch(request, `${api}tasks/${id}/move/`, { method: "POST", csrfToken, json: { direction } });
      if (result.status === 204) throw redirect(`/p/${slug}/c/${params.campaign}/edit#tasks`, { headers });
    } else {
      result = await backendFetch<{ hidden: boolean }>(request, `${api}tasks/${id}/`, { method: "DELETE", csrfToken });
      if (result.status === 200) throw back(result.data?.hidden ? "hidden" : "removed");
    }
    if (result.status === 404) throw data(null, { status: 404, headers });
    const body = result.data as Record<string, unknown> | null;
    const taskErrors = body && typeof body.code === "string" ? { code: body.code } : projectErrorCodes(body);
    const taskValues = intent === "task-add" ? taskPayload(form) : null;
    return data({ values: null, errors: {}, problem: null, taskErrors, taskValues }, { status: 400, headers });
  }
  if (intent === "link-add") {
    const linkValues = linkPayload(form);
    const result = await backendFetch(request, `${api}links/`, { method: "POST", csrfToken, json: linkValues });
    if (result.status === 201) throw redirect(`/p/${slug}/c/${params.campaign}/edit?done=link-added`, { headers });
    if (result.status === 404) throw data(null, { status: 404, headers });
    const fieldErrors = result.status === 400 && result.data && !("code" in (result.data as object)) ? projectErrorCodes(result.data) : {};
    const problem = Object.keys(fieldErrors).length ? null : campaignProblem(result.status, result.data);
    return data({ values: null, errors: {}, problem, linkErrors: fieldErrors, linkValues }, { status: 400, headers });
  }
  if (intent === "link-remove") {
    const id = String(form.get("link") ?? "");
    if (!isUuid(id)) throw data(null, { status: 404, headers });
    const result = await backendFetch(request, `${api}links/${id}/`, { method: "DELETE", csrfToken });
    if (result.status === 204) throw redirect(`/p/${slug}/c/${params.campaign}/edit?done=link-removed`, { headers });
    return data({ values: null, errors: {}, problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }
  if (intent === "delete") {
    if (form.get("confirm") !== "on") return data({ values: null, errors: {}, problem: "confirmDelete" as const }, { status: 400, headers });
    const result = await backendFetch(request, api, { method: "DELETE", csrfToken });
    if (result.status === 204) throw redirect(`/p/${slug}?campaign=deleted`, { headers });
    return data({ values: null, errors: {}, problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
  }

  const echo = campaignFormEcho(form);
  const { values, errors } = campaignPayload(form);
  if (Object.keys(errors).length) return data({ values: echo, errors, problem: null }, { status: 400, headers });
  const result = await backendFetch<Campaign>(request, api, { method: "PATCH", csrfToken, json: values });
  if (result.status === 200 && result.data) throw redirect(`/p/${slug}/c/${result.data.slug}/edit?done=saved`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  if (result.status === 400 && result.data && !("code" in (result.data as object))) {
    return data({ values: echo, errors: projectErrorCodes(result.data), problem: null }, { status: 400, headers });
  }
  return data({ values: echo, errors: {}, problem: campaignProblem(result.status, result.data) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function CampaignEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { project, campaign, csrfToken } = loaderData;
  const draft = campaign.state === "draft";
  const closed = campaign.state === "completed" || campaign.state === "cancelled";
  const problem = actionData?.problem ?? null;
  const stateButton = (intent: "publish" | "complete", label: string, icon: typeof CheckCircleIcon, variant: "primary" | "secondary") => (
    <Form method="post">
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" variant={variant} icon={icon}>
        {label}
      </Button>
    </Form>
  );
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[
          { label: project.name, to: `/p/${project.slug}` },
          { label: campaign.title, to: `/p/${project.slug}/c/${campaign.slug}` },
          { label: t("campaigns.edit") },
        ]}
        title={t("campaigns.editTitle", { title: campaign.title })}
      />
      {loaderData.saved ? <Notice tone="ok" title={t("campaigns.saved")} /> : null}
      {problem ? <Notice tone="danger" title={t(`campaigns.problem.${problem}`)} /> : null}

      <Panel title={t("campaigns.stateTitle")}>
        <div className={styles.stack}>
          <p>{t(`campaigns.stateText.${campaign.state}`)}</p>
          {draft && campaign.review_note ? (
            <Notice tone="danger" title={t("campaigns.reviewRejected")}>
              {campaign.review_note}
            </Notice>
          ) : null}
          {draft && campaign.visibility === "public" ? <Notice tone="info" title={t("campaigns.publicReviewNotice")} /> : null}
          {!closed ? (
            <div className={styles.buttonRow}>
              {draft ? stateButton("publish", campaign.visibility === "public" ? t("campaigns.submitReview") : t("campaigns.publish"), PaperPlaneTiltIcon, "primary") : null}
              {campaign.state === "published" ? stateButton("complete", t("campaigns.complete"), CheckCircleIcon, "secondary") : null}
            </div>
          ) : null}
          {!closed ? (
            <Form method="post" className={styles.form}>
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <input type="hidden" name="intent" value="cancel" />
              <CheckboxField id="confirm-cancel" name="confirm" label={t("campaigns.cancelConfirm", { title: campaign.title })} />
              <div>
                <Button type="submit" variant="danger" icon={XCircleIcon}>
                  {t("campaigns.cancel")}
                </Button>
              </div>
            </Form>
          ) : null}
        </div>
      </Panel>

      {closed ? (
        <Notice tone="info" title={t("campaigns.closedNotice")} />
      ) : (
        <CampaignForm
          csrfToken={csrfToken}
          platforms={loaderData.platforms}
          timeZones={loaderData.timeZones}
          values={actionData?.values ?? campaignFormValues(campaign)}
          errors={actionData?.errors ?? {}}
          submitLabel={t("campaigns.save")}
          editableAccess={draft}
        />
      )}

      {campaign.participation === "approval" ? (
        <QuestionsPanel
          questions={loaderData.questions}
          csrfToken={csrfToken}
          editable={draft}
          errors={actionData && "questionErrors" in actionData ? actionData.questionErrors : {}}
        />
      ) : null}

      <div id="tasks">
        <TasksPanel
          method={campaign.method}
          tasks={loaderData.tasks}
          csrfToken={csrfToken}
          editable={!closed}
          errors={actionData && "taskErrors" in actionData ? actionData.taskErrors : {}}
          values={actionData && "taskValues" in actionData ? actionData.taskValues : null}
          done={loaderData.taskDone}
        />
      </div>

      <LinksPanel
        links={loaderData.links}
        platforms={loaderData.platforms}
        csrfToken={csrfToken}
        editable={!closed}
        errors={actionData && "linkErrors" in actionData ? actionData.linkErrors : {}}
        values={actionData && "linkValues" in actionData ? actionData.linkValues : null}
        done={loaderData.linkDone}
      />

      {draft ? (
        <Panel title={t("campaigns.deleteTitle")}>
          <Form method="post" className={styles.form}>
            <p>{t("campaigns.deleteText")}</p>
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <input type="hidden" name="intent" value="delete" />
            <CheckboxField id="confirm-delete" name="confirm" label={t("campaigns.deleteConfirm", { title: campaign.title })} />
            <div>
              <Button type="submit" variant="danger" icon={TrashIcon}>
                {t("campaigns.delete")}
              </Button>
            </div>
          </Form>
        </Panel>
      ) : null}
    </div>
  );
}
