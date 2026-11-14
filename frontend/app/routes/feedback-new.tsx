/**
 * Give feedback (WP 5.3, ADR 0024). Active participants of a published campaign only; 404 for
 * everyone else. Step 1 chooses the kind (plain links), step 2 shows the kind's fields; works
 * without JavaScript. Files are added on the feedback's own page afterwards.
 */
import { useTranslation } from "react-i18next";
import { data, Link, redirect } from "react-router";

import type { Route } from "./+types/feedback-new";
import { FeedbackForm } from "~/components/feedback/FeedbackForm";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import type { Campaign, CampaignTasks } from "~/lib/campaigns";
import { loadCampaignFormData } from "~/lib/campaigns.server";
import { FEEDBACK_KINDS, feedbackEcho, feedbackPayload, feedbackProblem, isFeedbackKind, type Feedback } from "~/lib/feedback";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidProjectSlug, projectErrorCodes } from "~/lib/projects";

import styles from "~/components/feedback/Feedback.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Give feedback · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function paths(params: { slug?: string; campaign?: string }) {
  const slug = params.slug?.toLowerCase();
  const campaign = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaign)) throw data(null, { status: 404 });
  return { slug, campaign, api: `/api/v1/projects/${slug}/campaigns/${campaign}/` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { slug, campaign: campaignSlug, api } = paths(params);
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/c/${campaignSlug}/feedback/new`)}`, { headers: privateNoStoreHeaders() });
  }
  const [campaign, tasks] = await Promise.all([backendFetch<Campaign>(request, api), backendFetch<CampaignTasks>(request, `${api}tasks/`)]);
  // Only active participants of a published campaign give feedback; everyone else gets 404.
  if (campaign.status !== 200 || !campaign.data || !campaign.data.is_participant || campaign.data.state !== "published") {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  const { platforms, csrf } = await loadCampaignFormData(request);
  const kind = new URL(request.url).searchParams.get("kind");
  return data(
    {
      campaign: campaign.data,
      kind: isFeedbackKind(kind) ? kind : null,
      platforms,
      tasks: (tasks.data?.tasks ?? []).map((task) => ({ id: task.id, title: task.title })),
      csrfToken: csrf.token,
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const { slug, campaign, api } = paths(params);
  const headers = privateNoStoreHeaders();
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  if (form.get("intent") !== "create" || !isFeedbackKind(kind)) throw data(null, { status: 400, headers });
  const result = await backendFetch<Feedback>(request, `${api}feedback/`, {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: feedbackPayload(form, kind),
  });
  if (result.status === 201 && result.data) throw redirect(`/p/${slug}/c/${campaign}/feedback/${result.data.id}?done=sent`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const body = result.data as Record<string, unknown> | null;
  const fieldErrors = result.status === 400 && body && !("code" in body) ? projectErrorCodes(body) : {};
  const problem = Object.keys(fieldErrors).length ? null : feedbackProblem(result.status, body);
  return data({ errors: fieldErrors, values: feedbackEcho(form), problem }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function FeedbackNew({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, kind } = loaderData;
  const base = `/p/${campaign.project}/c/${campaign.slug}`;
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: campaign.title, to: base }, { label: t("feedback.give") }]}
        title={t("feedback.giveTitle", { campaign: campaign.title })}
        subtitle={t("feedback.intro")}
      />
      {actionData?.problem ? <Notice tone="danger" title={t(`feedback.problem.${actionData.problem}`)} /> : null}
      {kind ? (
        <Panel title={t(`feedback.kinds.${kind}`)} aside={<Link to={`${base}/feedback/new`}>{t("feedback.changeKind")}</Link>}>
          <FeedbackForm
            kind={kind}
            values={actionData?.values ?? { version: campaign.version }}
            errors={actionData?.errors ?? {}}
            platforms={loaderData.platforms}
            tasks={loaderData.tasks}
            csrfToken={loaderData.csrfToken}
            intent="create"
            submitLabel={t("feedback.send")}
          />
        </Panel>
      ) : (
        <Panel title={t("feedback.chooseKind")}>
          <ul className={styles.kinds} aria-label={t("feedback.chooseKind")}>
            {FEEDBACK_KINDS.map((k) => (
              <li key={k} className={styles.kind}>
                <Link to={`${base}/feedback/new?kind=${k}`}>{t(`feedback.kinds.${k}`)}</Link>
                <span className={styles.muted}>{t(`feedback.kindHints.${k}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
