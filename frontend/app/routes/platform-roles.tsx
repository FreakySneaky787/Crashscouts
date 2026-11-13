/**
 * Platform roles (WP 3B.1, ADR 0018): admins grant and revoke the admin and moderator roles.
 * 404 for everyone else. Every change needs the admin's password; roles count only with 2FA.
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/platform-roles";
import { Button } from "~/components/ui/Button";
import { SelectField, TextField } from "~/components/ui/Form";
import { CheckIcon, ShieldCheckIcon, WarningIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { isValidUsername } from "~/lib/profile";

import styles from "./forms.module.css";

type Entry = { username: string; role: "admin" | "moderator"; two_factor: boolean };
const ROLES = ["moderator", "admin", "none"] as const;
const PROBLEMS = ["wrong_password", "user_not_found", "target_needs_2fa", "last_admin", "invalid", "rateLimited", "generic"] as const;
type Problem = (typeof PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Platform roles · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fplatform%2Froles", { headers: privateNoStoreHeaders() });
  const [roles, csrf] = await Promise.all([backendFetch<Entry[]>(request, "/api/v1/platform/roles/"), ensureCsrfToken(request)]);
  if (roles.status !== 200 || !roles.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  const done = new URL(request.url).searchParams.get("done") === "1";
  return data({ roles: roles.data, csrfToken: csrf.token, done }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const headers = privateNoStoreHeaders();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "");
  if (!isValidUsername(username) || !(ROLES as readonly string[]).includes(role)) return data({ problem: "user_not_found" as Problem }, { status: 400, headers });
  const result = await backendFetch(request, "/api/v1/platform/roles/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { username, role, password: String(form.get("password") ?? "") },
  });
  if (result.status === 204) throw redirect("/platform/roles?done=1", { headers });
  if (result.status === 404) throw data(null, { status: 404, headers });
  const code = (result.data as { code?: string } | null)?.code ?? "";
  const problem: Problem = result.status === 429 ? "rateLimited" : (PROBLEMS as readonly string[]).includes(code) ? (code as Problem) : "generic";
  return data({ problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function PlatformRoles({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.stack}>
      <PageHeader title={t("platform.roles.title")} subtitle={t("platform.roles.intro")} />
      {loaderData.done ? <Notice tone="ok" title={t("platform.roles.done")} /> : null}
      {actionData?.problem ? <Notice tone="danger" title={t(`platform.roles.problem.${actionData.problem}`)} /> : null}
      <Panel title={t("platform.roles.current")}>
        <ul className={styles.plainList} aria-label={t("platform.roles.current")}>
          {loaderData.roles.map((entry) => (
            <li key={entry.username} className={styles.listRow}>
              <span>
                {entry.username} · {t(`platform.roles.names.${entry.role}`)}
              </span>
              {entry.two_factor ? (
                <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("platform.roles.active")} />
              ) : (
                <StatusPill tone="warn" icon={WarningIcon} label={t("platform.roles.inactive")} />
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t("platform.roles.change")}>
        <Form method="post" className={styles.form}>
          <input type="hidden" name="csrf_token" value={loaderData.csrfToken} />
          <TextField id="role-username" name="username" label={t("platform.roles.username")} hint={t("platform.roles.usernameHint")} autoCapitalize="none" spellCheck={false} required />
          <SelectField id="role-role" name="role" label={t("platform.roles.role")} options={ROLES.map((r) => ({ value: r, label: t(`platform.roles.names.${r}`) }))} />
          <TextField id="role-password" name="password" type="password" autoComplete="current-password" label={t("platform.roles.password")} hint={t("platform.roles.passwordHint")} required />
          <div>
            <Button type="submit" variant="primary" icon={CheckIcon}>
              {t("platform.roles.save")}
            </Button>
          </div>
        </Form>
      </Panel>
    </div>
  );
}
