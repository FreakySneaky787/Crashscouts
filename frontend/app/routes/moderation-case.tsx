/** One moderation case (WP 3B.3): reports, earlier warnings and blocks, and the actions.
 * Moderators only; 404 for everyone else. */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/moderation-case";
import { Button, ButtonLink } from "~/components/ui/Button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { ArrowLeftIcon, CheckIcon, ProhibitIcon, WarningIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { formatInZone } from "~/lib/campaigns";
import { CASE_ACTIONS, caseTargetHref, isCaseType, suspensionEnd, type Appeal, type CaseAction, type CaseDetail, type Suspension } from "~/lib/moderation";
import { reasonsFor } from "~/lib/reports";

import styles from "./forms.module.css";

const PROBLEMS = [
  "message_required",
  "already_blocked",
  "nothing_open",
  "not_suspended",
  "no_open_appeal",
  "confirm",
  "generic",
  // Account suspensions (WP 7.2).
  "end_required",
  "end_in_past",
  "already_suspended",
  "has_role",
  "not_yourself",
  "account_not_suspended",
] as const;
type Problem = (typeof PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Moderation case · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

function target(params: { type?: string; id?: string }) {
  if (!isCaseType(params.type) || !isUuid(params.id)) throw data(null, { status: 404 });
  return { type: params.type, id: params.id, api: `/api/v1/moderation/cases/${params.type}/${params.id}/` };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { api } = target(params);
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation", { headers: privateNoStoreHeaders() });
  const [detail, appeals, csrf] = await Promise.all([
    backendFetch<CaseDetail>(request, api),
    backendFetch<Appeal[]>(request, "/api/v1/moderation/appeals/"),
    ensureCsrfToken(request),
  ]);
  if (detail.status !== 200 || !detail.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const appeal = (appeals.data ?? []).find((a) => a.block === detail.data!.active_block) ?? null;
  const done = new URL(request.url).searchParams.get("done");
  return data({ detail: detail.data, appeal, csrfToken: csrf.token, done }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { type, id, api } = target(params);
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const headers = privateNoStoreHeaders();
  const here = `/moderation/${type}/${id}`;
  let result;
  if (intent === "suspend" && type === "user") {
    if (form.get("confirm") !== "on") return data({ problem: "confirm" as Problem }, { status: 400, headers });
    const end = suspensionEnd(form.get("permanent") === "on", String(form.get("ends_on") ?? ""));
    if (end === "invalid") return data({ problem: "end_required" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${api}suspend/`, {
      method: "POST",
      csrfToken,
      json: { category: String(form.get("category") ?? ""), message: String(form.get("message") ?? ""), ends_at: end },
    });
  } else if (intent === "suspension-lift" || intent === "suspension-uphold" || intent === "suspension-accept") {
    const suspension = String(form.get("suspension") ?? "");
    if (!isUuid(suspension)) throw data(null, { status: 404, headers });
    const base = `/api/v1/moderation/account-suspensions/${suspension}/`;
    const path = intent === "suspension-lift" ? `${base}lift/` : `${base}appeal/${intent === "suspension-accept" ? "lift" : "uphold"}/`;
    result = await backendFetch(request, path, { method: "POST", csrfToken });
    if (result.status === 400 && (result.data as { code?: string } | null)?.code === "not_suspended") {
      return data({ problem: "account_not_suspended" as Problem }, { status: 400, headers });
    }
  } else if ((CASE_ACTIONS as readonly string[]).includes(intent)) {
    if ((intent === "block" || intent === "dismiss") && form.get("confirm") !== "on") return data({ problem: "confirm" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${api}${intent as CaseAction}/`, {
      method: "POST",
      csrfToken,
      json: { category: String(form.get("category") ?? "other"), message: String(form.get("message") ?? "") },
    });
  } else if (intent === "lift" || intent === "appeal-uphold" || intent === "appeal-lift") {
    const block = String(form.get("block") ?? "");
    if (!isUuid(block)) throw data(null, { status: 404, headers });
    const path = intent === "lift" ? `/api/v1/moderation/blocks/${block}/lift/` : `/api/v1/moderation/appeals/${block}/${intent === "appeal-lift" ? "lift" : "uphold"}/`;
    result = await backendFetch(request, path, { method: "POST", csrfToken });
  } else {
    throw data(null, { status: 400, headers });
  }
  if (result.status === 204) throw redirect(`${here}?done=${intent}`, { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const code = (result.data as { code?: string } | null)?.code ?? "";
  return data({ problem: ((PROBLEMS as readonly string[]).includes(code) ? code : "generic") as Problem }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

function Hidden({ csrfToken, intent, block, suspension }: { csrfToken: string; intent: string; block?: string; suspension?: string }) {
  return (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
      {block ? <input type="hidden" name="block" value={block} /> : null}
      {suspension ? <input type="hidden" name="suspension" value={suspension} /> : null}
    </>
  );
}

/** A person's suspensions: the one in force with lifting and the appeal, the history, the form. */
function SuspensionPanel({ detail, csrfToken }: { detail: CaseDetail; csrfToken: string }) {
  const { t } = useTranslation();
  const all = detail.suspensions ?? [];
  const current = all.find((s) => s.id === detail.active_suspension) ?? null;
  const past = all.filter((s) => s !== current);
  const end = (s: Suspension) => (s.ends_at ? t("suspension.until", { end: `${formatInZone(s.ends_at, "UTC")} UTC` }) : t("suspension.permanent"));
  return (
    <Panel title={t("suspension.moderation.title")}>
      <div className={styles.stack}>
        {current ? (
          <div className={styles.stackTight}>
            <Notice tone="danger" title={t("suspension.moderation.active", { reason: t(`reports.reasons.${current.category}`), by: current.created_by ?? "?" })}>
              {current.message}
            </Notice>
            <p>{end(current)}</p>
            {current.appeal === "pending" ? (
              <div className={styles.stackTight}>
                <h3 className={styles.subhead}>{t("suspension.moderation.appeal")}</h3>
                <p>{current.appeal_text}</p>
                <div className={styles.buttonRow}>
                  <Form method="post">
                    <Hidden csrfToken={csrfToken} intent="suspension-accept" suspension={current.id} />
                    <Button type="submit" variant="primary" icon={CheckIcon}>
                      {t("suspension.moderation.accept")}
                    </Button>
                  </Form>
                  <Form method="post">
                    <Hidden csrfToken={csrfToken} intent="suspension-uphold" suspension={current.id} />
                    <Button type="submit" variant="secondary">
                      {t("suspension.moderation.uphold")}
                    </Button>
                  </Form>
                </div>
              </div>
            ) : null}
            <Form method="post">
              <Hidden csrfToken={csrfToken} intent="suspension-lift" suspension={current.id} />
              <Button type="submit" variant="secondary">
                {t("suspension.moderation.lift")}
              </Button>
            </Form>
          </div>
        ) : detail.can_suspend ? (
          <Form method="post" className={styles.form}>
            <Hidden csrfToken={csrfToken} intent="suspend" />
            <SelectField id="suspend-category" name="category" label={t("moderation.category")} options={reasonsFor("user").map((r) => ({ value: r, label: t(`reports.reasons.${r}`) }))} />
            <TextAreaField id="suspend-message" name="message" label={t("suspension.moderation.message")} hint={t("suspension.moderation.messageHint")} rows={3} maxLength={1000} required />
            <TextField id="suspend-ends-on" name="ends_on" type="date" label={t("suspension.moderation.endsOn")} hint={t("suspension.moderation.endsOnHint")} />
            <CheckboxField id="suspend-permanent" name="permanent" label={t("suspension.moderation.permanent")} />
            <CheckboxField id="suspend-confirm" name="confirm" label={t("suspension.moderation.confirm")} />
            <div>
              <Button type="submit" variant="danger" icon={ProhibitIcon}>
                {t("suspension.moderation.suspend")}
              </Button>
            </div>
          </Form>
        ) : (
          <p className={styles.muted}>{t("suspension.moderation.cannot")}</p>
        )}
        {past.length ? (
          <ul className={styles.plainList} aria-label={t("suspension.moderation.history")}>
            {past.map((s) => (
              <li key={s.id}>
                {t(`reports.reasons.${s.category}`)} · {end(s)} · {s.lifted_at ? t("suspension.moderation.liftedBy", { by: s.lifted_by ?? "?" }) : t("suspension.moderation.ended")}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

export default function ModerationCasePage({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { detail, appeal, csrfToken, done } = loaderData;
  const openReports = detail.reports.filter((r) => r.status === "open" || r.status === "in_review");
  // People are suspended (WP 7.2), not blocked; feedback is hidden; other content is blocked.
  const person = detail.target_type === "user";
  const feedback = detail.target_type === "feedback";
  const open = caseTargetHref(detail);
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: t("moderation.title"), to: "/moderation" }, { label: detail.title }]}
        title={detail.title}
        subtitle={[t(`moderation.types.${detail.target_type}`), detail.project_name].filter(Boolean).join(" · ")}
      />
      {done ? <Notice tone="ok" title={t("moderation.done")} /> : null}
      {actionData?.problem ? <Notice tone="danger" title={t(`moderation.problem.${actionData.problem}`)} /> : null}

      <Panel title={t("moderation.target")}>
        <div className={styles.stackTight}>
          {detail.url ? <code className={styles.secret}>{detail.url}</code> : null}
          {detail.suspended ? <Notice tone="info" title={t("campaigns.links.suspended")} /> : null}
          {detail.blocked ? <Notice tone="danger" title={t(feedback ? "moderation.hidden" : "moderation.blocked")} /> : null}
          {open ? (
            <p>
              <a href={open}>{t(person ? "moderation.openProfile" : "moderation.openFeedback")}</a>
            </p>
          ) : null}
          <ButtonLink to="/moderation" variant="quiet" icon={ArrowLeftIcon}>
            {t("moderation.backToQueue")}
          </ButtonLink>
        </div>
      </Panel>

      <Panel title={t("moderation.reports")} aside={String(detail.reports.length)}>
        <ul className={styles.plainList} aria-label={t("moderation.reports")}>
          {detail.reports.map((r) => (
            <li key={`${r.created_at}-${r.reporter}`} className={styles.stackTight}>
              <strong>{t(`reports.reasons.${r.reason}`)}</strong>
              {r.text ? <span>{r.text}</span> : null}
              <span className={styles.muted}>
                {r.reporter ?? t("moderation.deletedAccount")} · {t(`reports.statuses.${r.status as "open"}`)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {detail.notes.length || detail.blocks.length ? (
        <Panel title={t("moderation.history")}>
          <ul className={styles.plainList} aria-label={t("moderation.history")}>
            {detail.notes.map((n) => (
              <li key={n.created_at}>
                {t("moderation.warning")}: {n.text}
              </li>
            ))}
            {detail.blocks.map((b) => (
              <li key={b.id}>
                {t("moderation.block")} ({t(`reports.reasons.${b.category}`)}): {b.message}
                {b.lifted_at ? ` · ${t("moderation.lifted")}` : ""}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {person ? <SuspensionPanel detail={detail} csrfToken={csrfToken} /> : null}

      {appeal ? (
        <Panel title={t("moderation.appeal")}>
          <div className={styles.stack}>
            <p>{appeal.appeal_text}</p>
            <div className={styles.buttonRow}>
              <Form method="post">
                <Hidden csrfToken={csrfToken} intent="appeal-lift" block={appeal.block} />
                <Button type="submit" variant="primary" icon={CheckIcon}>
                  {t("moderation.appealLift")}
                </Button>
              </Form>
              <Form method="post">
                <Hidden csrfToken={csrfToken} intent="appeal-uphold" block={appeal.block} />
                <Button type="submit" variant="secondary">
                  {t("moderation.appealUphold")}
                </Button>
              </Form>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title={t("moderation.actions")}>
        <div className={styles.stack}>
          {openReports.length ? (
            <Form method="post">
              <Hidden csrfToken={csrfToken} intent="take" />
              <Button type="submit" variant="quiet">
                {t("moderation.take")}
              </Button>
            </Form>
          ) : null}
          {detail.suspended ? (
            <Form method="post">
              <Hidden csrfToken={csrfToken} intent="lift-suspension" />
              <Button type="submit" variant="secondary">
                {t("moderation.liftSuspension")}
              </Button>
            </Form>
          ) : null}
          {detail.active_block ? (
            <Form method="post">
              <Hidden csrfToken={csrfToken} intent="lift" block={detail.active_block} />
              <Button type="submit" variant="secondary">
                {t(feedback ? "moderation.unhide" : "moderation.liftBlock")}
              </Button>
            </Form>
          ) : person ? null : (
            <Form method="post" className={styles.form}>
              <Hidden csrfToken={csrfToken} intent="block" />
              <h3 className={styles.subhead}>{t(feedback ? "moderation.hideTitle" : "moderation.blockTitle")}</h3>
              <SelectField id="block-category" name="category" label={t("moderation.category")} options={reasonsFor(detail.target_type).map((r) => ({ value: r, label: t(`reports.reasons.${r}`) }))} />
              <TextAreaField
                id="block-message"
                name="message"
                label={t("moderation.message")}
                hint={t(feedback ? "moderation.messageHintFeedback" : "moderation.messageHint")}
                rows={3}
                maxLength={1000}
                required
              />
              <CheckboxField id="block-confirm" name="confirm" label={t(feedback ? "moderation.hideConfirm" : "moderation.blockConfirm")} />
              <div>
                <Button type="submit" variant="danger" icon={ProhibitIcon}>
                  {t(feedback ? "moderation.hideButton" : "moderation.blockButton")}
                </Button>
              </div>
            </Form>
          )}
          <Form method="post" className={styles.form}>
            <Hidden csrfToken={csrfToken} intent="warn" />
            <h3 className={styles.subhead}>{t(person ? "moderation.warnTitlePerson" : "moderation.warnTitle")}</h3>
            <TextAreaField id="warn-message" name="message" label={t(person ? "moderation.warnMessagePerson" : "moderation.warnMessage")} rows={3} maxLength={1000} required />
            <div>
              <Button type="submit" variant="secondary" icon={WarningIcon}>
                {t("moderation.warnButton")}
              </Button>
            </div>
          </Form>
          {openReports.length ? (
            <Form method="post" className={styles.form}>
              <Hidden csrfToken={csrfToken} intent="dismiss" />
              <CheckboxField id="dismiss-confirm" name="confirm" label={t("moderation.dismissConfirm")} />
              <div>
                <Button type="submit" variant="quiet" icon={XIcon}>
                  {t("moderation.dismiss")}
                </Button>
              </div>
            </Form>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
