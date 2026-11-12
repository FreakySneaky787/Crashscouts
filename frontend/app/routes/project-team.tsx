/**
 * Project team (WP 2.3): members, pending invitations, invite (owner), remove (owner), leave
 * (maintainer), hand over ownership (owner, with password). 404 outside the team.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/project-team";
import { Button } from "~/components/ui/Button";
import { SelectField, TextField } from "~/components/ui/Form";
import { SignOutIcon, UserPlusIcon, UsersIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { isUuid, privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidUsername } from "~/lib/profile";
import { isValidProjectSlug, type Project } from "~/lib/projects";

import styles from "./forms.module.css";

type Team = {
  members: { username: string; role: "owner" | "maintainer" }[];
  invitations: { id: string; username: string; expires_at: string }[];
};

const RESULTS = ["invited", "revoked", "removed", "left", "transferred"] as const;
const PROBLEMS = [
  "user_not_found", "already_member", "already_invited", "too_many_invitations", "owner_cannot_leave",
  "not_a_maintainer", "wrong_password", "no_password", "forbidden", "rateLimited", "generic",
] as const;
type Problem = (typeof PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Team · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const me = await getSessionUser(request);
  if (!me) throw redirect(`/login?next=${encodeURIComponent(`/p/${slug}/team`)}`, { headers: privateNoStoreHeaders() });
  const [project, team, csrf] = await Promise.all([
    backendFetch<Project>(request, `/api/v1/projects/${slug}/`),
    backendFetch<Team>(request, `/api/v1/projects/${slug}/team/`),
    ensureCsrfToken(request),
  ]);
  if (project.status !== 200 || team.status !== 200 || !project.data || !team.data) {
    throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  }
  if (project.data.slug !== params.slug) throw redirect(`/p/${project.data.slug}/team`, { headers: privateNoStoreHeaders() });
  const done = new URL(request.url).searchParams.get("done");
  return data(
    {
      project: project.data,
      team: team.data,
      me: me.username,
      csrfToken: csrf.token,
      done: (RESULTS as readonly string[]).includes(done ?? "") ? (done as (typeof RESULTS)[number]) : null,
    },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug?.toLowerCase();
  if (!isValidProjectSlug(slug)) throw data(null, { status: 404 });
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const headers = privateNoStoreHeaders();
  const base = `/api/v1/projects/${slug}`;

  let result;
  let success: (typeof RESULTS)[number];
  if (intent === "invite") {
    if (!isValidUsername(username)) return data({ problem: "user_not_found" as Problem }, { status: 400, headers });
    result = await backendFetch(request, `${base}/invitations/`, { method: "POST", csrfToken, json: { username } });
    success = "invited";
  } else if (intent === "revoke") {
    const id = String(form.get("id") ?? "");
    if (!isUuid(id)) throw data(null, { status: 404 });
    result = await backendFetch(request, `${base}/invitations/${id}/`, { method: "DELETE", csrfToken });
    success = "revoked";
  } else if (intent === "remove" || intent === "leave") {
    if (!isValidUsername(username)) throw data(null, { status: 404 });
    result = await backendFetch(request, `${base}/members/${username}/`, { method: "DELETE", csrfToken });
    success = intent === "leave" ? "left" : "removed";
  } else if (intent === "transfer") {
    result = await backendFetch(request, `${base}/transfer/`, {
      method: "POST",
      csrfToken,
      json: { username, password: String(form.get("password") ?? "") },
    });
    success = "transferred";
  } else {
    throw data(null, { status: 400 });
  }

  if (result.status === 201 || result.status === 204) {
    // Leaving a private project ends access; go to the account page.
    throw redirect(success === "left" ? "/account" : `/p/${slug}/team?done=${success}`, { headers });
  }
  const code = (result.data as { code?: string } | null)?.code ?? "";
  const problem: Problem =
    result.status === 429 ? "rateLimited" : (PROBLEMS as readonly string[]).includes(code) ? (code as Problem) : result.status === 403 ? "forbidden" : "generic";
  return data({ problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

function Hidden({ csrfToken, intent }: { csrfToken: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

export default function ProjectTeam({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { project, team, me, csrfToken, done } = loaderData;
  const isOwner = project.role === "owner";
  const maintainers = team.members.filter((m) => m.role === "maintainer");
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: project.name, to: `/p/${project.slug}` }, { label: t("team.title") }]}
        title={t("team.title")}
        subtitle={t("team.intro")}
      />
      {done ? <Notice tone="ok" title={t(`team.done.${done}`)} /> : null}
      {actionData?.problem ? <Notice tone="danger" title={t(`team.problem.${actionData.problem}`)} /> : null}

      <Panel title={t("team.members")} aside={String(team.members.length)}>
        <ul className={styles.plainList} aria-label={t("team.members")}>
          {team.members.map((member) => (
            <li key={member.username} className={styles.listRow}>
              <span>
                {member.username} <span className={styles.muted}>· {t(`projects.roles.${member.role}`)}</span>
              </span>
              {member.role === "maintainer" && (isOwner || member.username === me) ? (
                <Form method="post">
                  <Hidden csrfToken={csrfToken} intent={member.username === me ? "leave" : "remove"} />
                  <input type="hidden" name="username" value={member.username} />
                  <Button
                    type="submit"
                    variant="quiet"
                    size="sm"
                    icon={member.username === me ? SignOutIcon : XIcon}
                    aria-label={member.username === me ? t("team.leave") : t("team.removeNamed", { name: member.username })}
                  >
                    {member.username === me ? t("team.leave") : t("team.remove")}
                  </Button>
                </Form>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      {isOwner ? (
        <>
          <Panel title={t("team.inviteTitle")}>
            <Form method="post" className={styles.form}>
              <Hidden csrfToken={csrfToken} intent="invite" />
              <p>{t("team.inviteText")}</p>
              <TextField id="invite-username" name="username" label={t("signup.username")} autoCapitalize="none" spellCheck={false} required />
              <div>
                <Button type="submit" icon={UserPlusIcon}>
                  {t("team.invite")}
                </Button>
              </div>
            </Form>
            {team.invitations.length ? (
              <ul className={styles.plainList} aria-label={t("team.pending")}>
                {team.invitations.map((invitation) => (
                  <li key={invitation.id} className={styles.listRow}>
                    <span>
                      {invitation.username} <span className={styles.muted}>· {t("team.pendingUntil", { date: invitation.expires_at.slice(0, 10) })}</span>
                    </span>
                    <Form method="post">
                      <Hidden csrfToken={csrfToken} intent="revoke" />
                      <input type="hidden" name="id" value={invitation.id} />
                      <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("team.revokeNamed", { name: invitation.username })}>
                        {t("team.revoke")}
                      </Button>
                    </Form>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          {maintainers.length ? (
            <Panel title={t("team.transferTitle")}>
              <Form method="post" className={styles.form}>
                <Hidden csrfToken={csrfToken} intent="transfer" />
                <p>{t("team.transferText")}</p>
                <SelectField id="transfer-username" name="username" label={t("team.newOwner")} options={maintainers.map((m) => ({ value: m.username, label: m.username }))} />
                <TextField id="transfer-password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
                <div>
                  <Button type="submit" variant="danger" icon={UsersIcon}>
                    {t("team.transfer")}
                  </Button>
                </div>
              </Form>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
