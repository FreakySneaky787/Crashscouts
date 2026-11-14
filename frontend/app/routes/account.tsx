import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/account";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Notice } from "~/components/ui/Notice";
import { Avatar } from "~/components/ui/Data";
import { DatabaseIcon, EyeIcon, LockSimpleIcon, PencilSimpleIcon, PlusIcon, ShieldCheckIcon, SignOutIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { FEEDBACK_STATUS } from "~/components/ui/statuses";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { feedbackStatusStyleKey, type MyFeedback } from "~/lib/feedback";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { verificationOutcome } from "~/lib/verification";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Account · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login?next=/account", { headers: privateNoStoreHeaders() });
  }
  const [csrf, projects, invitations, campaignInvitations, participations, applications, role, reports, feedback] = await Promise.all([
    ensureCsrfToken(request),
    backendFetch<{ slug: string; name: string; role: string; visibility: string }[]>(request, "/api/v1/me/projects/"),
    backendFetch<{ id: string; project_name: string; invited_by: string | null }[]>(request, "/api/v1/me/invitations/"),
    backendFetch<{ id: string; campaign_title: string; campaign_slug: string; project_name: string; project_slug: string; invited_by: string | null }[]>(
      request,
      "/api/v1/me/campaign-invitations/",
    ),
    backendFetch<
      {
        campaign_title: string;
        campaign_slug: string;
        project_name: string;
        project_slug: string;
        tasks_total: number;
        tasks_completed: number;
        tasks_blocked: number;
      }[]
    >(request, "/api/v1/me/participations/"),
    backendFetch<{ campaign_title: string; campaign_slug: string; project_name: string; project_slug: string; status: "pending" | "rejected" }[]>(
      request,
      "/api/v1/me/applications/",
    ),
    backendFetch<{ platform_role: string }>(request, "/api/v1/me/platform-role/"),
    backendFetch<{ target_label: string; reason: string; status: string; created_at: string }[]>(request, "/api/v1/me/reports/"),
    backendFetch<MyFeedback[]>(request, "/api/v1/me/feedback/"),
  ]);
  const params = new URL(request.url).searchParams;
  const deleted = params.get("project") === "deleted";
  const participationLeft = params.get("participation") === "left";
  const feedbackWithdrawn = params.get("feedback") === "withdrawn";
  const campaignAnswer = params.get("campaign_invitation");
  const campaignInvitationResult: "joined" | "declined" | "full" | "closed" | "gone" | null =
    campaignAnswer === "joined" || campaignAnswer === "declined" || campaignAnswer === "full" || campaignAnswer === "closed" || campaignAnswer === "gone"
      ? campaignAnswer
      : null;
  // A GitHub verification that could not be tied to a project ends here (e.g. expired state).
  const outcome = verificationOutcome(params);
  const verificationError = outcome && !outcome.ok ? outcome.error : null;
  const answered = params.get("invitation");
  const invitationResult: "accepted" | "declined" | "gone" | null =
    answered === "accepted" || answered === "declined" || answered === "gone" ? answered : null;
  return data(
    {
      username: user.username,
      csrfToken: csrf.token,
      projects: projects.data ?? [],
      invitations: invitations.data ?? [],
      deleted,
      invitationResult,
      verificationError,
      campaignInvitations: campaignInvitations.data ?? [],
      participations: participations.data ?? [],
      applications: applications.data ?? [],
      isAdmin: role.data?.platform_role === "admin",
      isModerator: role.data?.platform_role === "admin" || role.data?.platform_role === "moderator",
      reports: reports.data ?? [],
      campaignInvitationResult,
      participationLeft,
      feedbackWithdrawn,
      feedback: feedback.data ?? [],
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.narrow}>
      <PageHeader
        title={t("account.title")}
        leading={<Avatar name={loaderData.username} id={loaderData.username} size="lg" />}
        subtitle={<span data-testid="signed-in-as">{t("account.signedInAs", { username: loaderData.username })}</span>}
      />
      {loaderData.deleted ? <Notice tone="ok" title={t("projects.deleted")} /> : null}
      {loaderData.verificationError ? <Notice tone="danger" title={t(`verification.errors.${loaderData.verificationError}`)} /> : null}
      {loaderData.invitationResult ? (
        <Notice tone={loaderData.invitationResult === "gone" ? "danger" : "ok"} title={t(`invitations.${loaderData.invitationResult}`)} />
      ) : null}
      {loaderData.participationLeft ? <Notice tone="ok" title={t("campaigns.join.left")} /> : null}
      {loaderData.feedbackWithdrawn ? <Notice tone="ok" title={t("feedback.withdrawn")} /> : null}
      {loaderData.campaignInvitationResult ? (
        <Notice
          tone={["joined", "declined"].includes(loaderData.campaignInvitationResult) ? "ok" : "danger"}
          title={t(`campaigns.invitations.result.${loaderData.campaignInvitationResult}`)}
        />
      ) : null}
      {loaderData.campaignInvitations.length ? (
        <Panel title={t("campaigns.invitations.title")}>
          <ul className={styles.plainList} aria-label={t("campaigns.invitations.title")}>
            {loaderData.campaignInvitations.map((invitation) => (
              <li key={invitation.id} className={styles.listRow}>
                <span>
                  {t("campaigns.invitations.text", { inviter: invitation.invited_by ?? "?", project: invitation.project_name })}{" "}
                  <Link to={`/p/${invitation.project_slug}/c/${invitation.campaign_slug}`}>{invitation.campaign_title}</Link>
                </span>
                <span className={styles.buttonRow}>
                  <Form method="post" action={`/campaign-invitations/${invitation.id}/accept`}>
                    <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                    <Button type="submit" size="sm" variant="primary" aria-label={t("campaigns.invitations.acceptNamed", { title: invitation.campaign_title })}>
                      {t("invitations.accept")}
                    </Button>
                  </Form>
                  <Form method="post" action={`/campaign-invitations/${invitation.id}/decline`}>
                    <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                    <Button type="submit" size="sm" variant="quiet" aria-label={t("campaigns.invitations.declineNamed", { title: invitation.campaign_title })}>
                      {t("invitations.decline")}
                    </Button>
                  </Form>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {loaderData.participations.length ? (
        <Panel title={t("campaigns.invitations.mine")}>
          <ul className={styles.plainList} aria-label={t("campaigns.invitations.mine")}>
            {loaderData.participations.map((p) => (
              <li key={`${p.project_slug}/${p.campaign_slug}`} className={styles.listRow}>
                <Link to={`/p/${p.project_slug}/c/${p.campaign_slug}`}>{p.campaign_title}</Link>
                <span className={styles.muted}>
                  {p.project_name}
                  {p.tasks_total
                    ? ` · ${t(p.tasks_blocked ? "campaigns.tasks.progress.summaryBlocked" : "campaigns.tasks.progress.summary", {
                        completed: p.tasks_completed,
                        total: p.tasks_total,
                        blocked: p.tasks_blocked,
                      })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {loaderData.feedback.length ? (
        <Panel title={t("feedback.mine")}>
          <ul className={styles.plainList} aria-label={t("feedback.mine")}>
            {loaderData.feedback.map((f) => {
              const style = FEEDBACK_STATUS[feedbackStatusStyleKey(f.status)];
              return (
                <li key={f.id} className={styles.listRow}>
                  <span className={styles.stackTight}>
                    <Link to={`/p/${f.project_slug}/c/${f.campaign_slug}/feedback/${f.id}`}>{f.title}</Link>
                    <span className={styles.muted}>
                      {f.campaign_title} · {t(`feedback.kinds.${f.kind}`)}
                      {f.published ? ` · ${t("feedback.public")}` : ""}
                    </span>
                  </span>
                  <StatusPill tone={style.tone} icon={"icon" in style ? style.icon : undefined} label={t(`feedback.statuses.${f.status}`)} />
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
      {loaderData.applications.length ? (
        <Panel title={t("campaigns.apply.mine")}>
          <ul className={styles.plainList} aria-label={t("campaigns.apply.mine")}>
            {loaderData.applications.map((a) => (
              <li key={`${a.project_slug}/${a.campaign_slug}`} className={styles.listRow}>
                <Link to={`/p/${a.project_slug}/c/${a.campaign_slug}`}>{a.campaign_title}</Link>
                <span className={styles.muted}>{t(`campaigns.apply.statuses.${a.status}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {loaderData.invitations.length ? (
        <Panel title={t("invitations.title")}>
          <ul className={styles.plainList} aria-label={t("invitations.title")}>
            {loaderData.invitations.map((invitation) => (
              <li key={invitation.id} className={styles.listRow}>
                <span>
                  {invitation.invited_by
                    ? t("invitations.text", { inviter: invitation.invited_by, project: invitation.project_name })
                    : t("invitations.textNoInviter", { project: invitation.project_name })}
                </span>
                <span className={styles.buttonRow}>
                  <Form method="post" action={`/invitations/${invitation.id}/accept`}>
                    <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                    <Button type="submit" size="sm" variant="primary">
                      {t("invitations.accept")}
                    </Button>
                  </Form>
                  <Form method="post" action={`/invitations/${invitation.id}/decline`}>
                    <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
                    <Button type="submit" size="sm" variant="quiet">
                      {t("invitations.decline")}
                    </Button>
                  </Form>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title={t("projects.mine")}>
        <div className={styles.stack}>
          {loaderData.projects.length ? (
            <ul className={styles.plainList} aria-label={t("projects.mine")}>
              {loaderData.projects.map((project) => (
                <li key={project.slug} className={styles.listRow}>
                  <Link to={`/p/${project.slug}`}>{project.name}</Link>
                  <span className={styles.muted}>
                    {project.visibility === "private" ? <LockSimpleIcon aria-hidden="true" className={styles.inlineIcon} /> : null}{" "}
                    {t(`projects.roles.${project.role as "owner"}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("projects.none")}</p>
          )}
          <div>
            <ButtonLink to="/projects/new" icon={PlusIcon}>
              {t("projects.newTitle")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      {loaderData.isModerator ? (
        <Panel title={t("platform.title")}>
          <div className={styles.stack}>
            <p>{t("platform.text")}</p>
            <div className={styles.buttonRow}>
              <ButtonLink to="/moderation" icon={ShieldCheckIcon}>
                {t("moderation.title")}
              </ButtonLink>
              {loaderData.isAdmin ? (
                <ButtonLink to="/platform/roles" variant="secondary" icon={ShieldCheckIcon}>
                  {t("platform.roles.title")}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}
      {loaderData.reports.length ? (
        <Panel title={t("reports.mine")}>
          <ul className={styles.plainList} aria-label={t("reports.mine")}>
            {loaderData.reports.map((r) => (
              <li key={`${r.created_at}-${r.target_label}`} className={styles.listRow}>
                <span>
                  {r.target_label} · {t(`reports.reasons.${r.reason as "spam"}`)}
                </span>
                <span className={styles.muted}>{t(`reports.statuses.${r.status as "open"}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title={t("account.profile")}>
        <div className={styles.stack}>
          <p>{t("account.profileText")}</p>
          <div className={styles.buttonRow}>
            <ButtonLink to="/settings/profile" icon={PencilSimpleIcon}>
              {t("account.editProfile")}
            </ButtonLink>
            <ButtonLink to={`/u/${loaderData.username}`} variant="quiet" icon={EyeIcon}>
              {t("settings.viewPublic")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      <Panel title={t("account.security")}>
        <div className={styles.stack}>
          <p>{t("account.securityText")}</p>
          <div>
            <ButtonLink to="/settings/security" icon={ShieldCheckIcon}>
              {t("account.editSecurity")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      <Panel title={t("account.data")}>
        <div className={styles.stack}>
          <p>{t("account.dataText")}</p>
          <div>
            <ButtonLink to="/settings/account" icon={DatabaseIcon}>
              {t("account.editData")}
            </ButtonLink>
          </div>
        </div>
      </Panel>
      <Panel title={t("account.session")}>
        <p>{t("account.sessionText")}</p>
        <Form method="post" action="/logout">
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <Button type="submit" icon={SignOutIcon}>
            {t("nav.logout")}
          </Button>
        </Form>
      </Panel>
    </div>
  );
}
