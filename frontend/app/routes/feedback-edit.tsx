/**
 * Change one's own feedback while it is "New" (WP 5.3, ADR 0024). 404 for everyone else and once
 * the team has looked at it.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/feedback-edit";
import { FeedbackForm } from "~/components/feedback/FeedbackForm";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import type { CampaignTasks } from "~/lib/campaigns";
import { loadCampaignFormData } from "~/lib/campaigns.server";
import { feedbackEcho, feedbackPayload, feedbackProblem, feedbackValues, type Feedback } from "~/lib/feedback";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes } from "~/lib/projects";

import styles from "~/components/feedback/Feedback.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Edit feedback · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function paths(params: { slug?: string; campaign?: string; id?: string }) {
  const slug = params.slug?.toLowerCase();
  const campaign = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaign) || !isUuid(params.id)) throw data(null, { status: 404 });
  const api = `/api/v1/projects/${slug}/campaigns/${campaign}/`;
  return { api, feedbackApi: `${api}feedback/${params.id}/`, page: `/p/${slug}/c/${campaign}/feedback/${params.id}` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { api, feedbackApi, page } = paths(params);
  if (!(await getSessionUser(request))) throw redirect(`/login?next=${encodeURIComponent(`${page}/edit`)}`, { headers: privateNoStoreHeaders() });
  const [feedback, tasks] = await Promise.all([backendFetch<Feedback>(request, feedbackApi), backendFetch<CampaignTasks>(request, `${api}tasks/`)]);
  if (feedback.status !== 200 || !feedback.data?.can_change) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const { platforms, csrf } = await loadCampaignFormData(request);
  return data(
    {
      feedback: feedback.data,
      page,
      platforms,
      tasks: (tasks.data?.tasks ?? []).map((task) => ({ id: task.id, title: task.title })),
      csrfToken: csrf.token,
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { feedbackApi, page } = paths(params);
  const headers = privateNoStoreHeaders();
  const form = await request.formData();
  const current = await backendFetch<Feedback>(request, feedbackApi);
  if (current.status !== 200 || !current.data) throw data(null, { status: 404, headers });
  const result = await backendFetch(request, feedbackApi, {
    method: "PATCH",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: feedbackPayload(form, current.data.kind),
  });
  if (result.status === 200) throw redirect(`${page}?done=saved`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const body = result.data as Record<string, unknown> | null;
  const fieldErrors = result.status === 400 && body && !("code" in body) ? projectErrorCodes(body) : {};
  const problem = Object.keys(fieldErrors).length ? null : feedbackProblem(result.status, body);
  return data({ errors: fieldErrors, values: feedbackEcho(form), problem }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function FeedbackEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { feedback, page } = loaderData;
  return (
    <div className={styles.stack}>
      <PageHeader breadcrumbs={[{ label: feedback.title, to: page }, { label: t("feedback.edit") }]} title={t("feedback.editTitle")} />
      {actionData?.problem ? <Notice tone="danger" title={t(`feedback.problem.${actionData.problem}`)} /> : null}
      <Panel title={t(`feedback.kinds.${feedback.kind}`)}>
        <FeedbackForm
          kind={feedback.kind}
          values={actionData?.values ?? feedbackValues(feedback)}
          errors={actionData?.errors ?? {}}
          platforms={loaderData.platforms}
          tasks={loaderData.tasks}
          csrfToken={loaderData.csrfToken}
          intent="change"
          submitLabel={t("feedback.save")}
        />
      </Panel>
    </div>
  );
}
