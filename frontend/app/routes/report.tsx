/**
 * Report a project, a campaign, a download link (WP 3B.2, ADR 0019), a person or published
 * feedback (WP 7.1, ADR 0026). Only what the person can see can be reported: the target is loaded
 * through the normal API first (404 otherwise); Django checks again.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/report";
import { Button, ButtonLink } from "~/components/ui/Button";
import { SelectField, TextAreaField } from "~/components/ui/Form";
import { ArrowLeftIcon, WarningIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { reasonsFor, reportTarget, type ReportTarget } from "~/lib/reports";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

const PROBLEMS = ["already_reported", "email_unconfirmed", "rateLimited", "generic"] as const;
type Problem = (typeof PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Report · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

async function loadTarget(request: Request, target: ReportTarget): Promise<string> {
  const base = `/api/v1/projects/${target.project}/`;
  if (target.type === "user") {
    const result = await backendFetch<{ username: string }>(request, `/api/v1/profiles/${target.username}/`);
    if (result.status === 200 && result.data) return `@${result.data.username}`;
  } else if (target.type === "feedback") {
    const result = await backendFetch<{ title: string; published: boolean }>(request, `${base}campaigns/${target.campaign}/feedback/${target.feedback}/`);
    if (result.status === 200 && result.data?.published) return result.data.title;
  } else if (target.type === "project") {
    const result = await backendFetch<{ name: string }>(request, base);
    if (result.status === 200 && result.data) return result.data.name;
  } else if (target.type === "campaign") {
    const result = await backendFetch<{ title: string }>(request, `${base}campaigns/${target.campaign}/`);
    if (result.status === 200 && result.data) return result.data.title;
  } else {
    const result = await backendFetch<{ label: string; host: string }>(request, `${base}campaigns/${target.campaign}/links/${target.link}/`);
    if (result.status === 200 && result.data) return `${result.data.label} (${result.data.host})`;
  }
  throw data(null, { status: 404, headers: privateNoStoreHeaders() });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const target = reportTarget(url.searchParams);
  if (!target) throw data(null, { status: 404 });
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, { headers: privateNoStoreHeaders() });
  }
  const [label, csrf] = await Promise.all([loadTarget(request, target), ensureCsrfToken(request)]);
  return data({ target, label, csrfToken: csrf.token }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const target = reportTarget(new URL(request.url).searchParams);
  if (!target) throw data(null, { status: 404 });
  const form = await request.formData();
  const headers = privateNoStoreHeaders();
  const result = await backendFetch(request, "/api/v1/reports/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: {
      target_type: target.type,
      project: target.project,
      campaign: target.campaign ?? "",
      link: target.link ?? null,
      username: target.username ?? "",
      feedback: target.feedback ?? null,
      reason: String(form.get("reason") ?? ""),
      text: String(form.get("text") ?? ""),
    },
  });
  if (result.status === 201) throw redirect(`${target.back}?reported=1`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const code = (result.data as { code?: string } | null)?.code ?? "";
  const problem: Problem = result.status === 429 ? "rateLimited" : (PROBLEMS as readonly string[]).includes(code) ? (code as Problem) : "generic";
  return data({ problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function Report({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { target, label, csrfToken } = loaderData;
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("reports.title")} subtitle={t(`reports.subtitle.${target.type}`, { label })} />
      <div className={styles.stack}>
        {actionData?.problem ? <Notice tone="danger" title={t(`reports.problem.${actionData.problem}`)} /> : null}
        <Panel title={t("reports.panel")}>
          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <SelectField
              id="report-reason"
              name="reason"
              label={t("reports.reason")}
              hint={target.type === "user" || target.type === "feedback" ? undefined : t("reports.reasonHint")}
              options={reasonsFor(target.type).map((r) => ({ value: r, label: t(`reports.reasons.${r}`) }))}
            />
            <TextAreaField id="report-text" name="text" label={t("reports.text")} hint={t("reports.textHint")} rows={4} maxLength={1000} />
            <p className={styles.muted}>{t("reports.privacy")}</p>
            <div className={styles.buttonRow}>
              <Button type="submit" variant="primary" icon={WarningIcon}>
                {t("reports.send")}
              </Button>
              <ButtonLink to={target.back} variant="quiet" icon={ArrowLeftIcon}>
                {t("reports.back")}
              </ButtonLink>
            </div>
          </Form>
        </Panel>
      </div>
    </div>
  );
}
