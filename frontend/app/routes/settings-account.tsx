/**
 * Account settings (WP 1.5): download your data, delete your account (14-day grace period).
 * Both need the current password; everything works without JavaScript.
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/settings-account";
import { Button } from "~/components/ui/Button";
import { CheckboxField, TextField } from "~/components/ui/Form";
import { DownloadSimpleIcon, TrashIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

const EXPORT_PROBLEMS = ["wrongPassword", "noPassword", "rateLimited", "generic"] as const;
type ExportProblem = (typeof EXPORT_PROBLEMS)[number];

export function meta(_: Route.MetaArgs) {
  return [{ title: `Account settings · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) {
    throw redirect("/login?next=%2Fsettings%2Faccount", { headers: privateNoStoreHeaders() });
  }
  const problem = new URL(request.url).searchParams.get("export");
  const exportProblem = (EXPORT_PROBLEMS as readonly string[]).includes(problem ?? "") ? (problem as ExportProblem) : null;
  const csrf = await ensureCsrfToken(request);
  return data({ csrfToken: csrf.token, exportProblem }, { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await backendFetch<Record<string, string[]>>(request, "/api/v1/me/deletion/", {
    method: "POST",
    csrfToken: String(form.get("csrf_token") ?? ""),
    json: { password: String(form.get("password") ?? ""), confirm: form.get("confirm") === "on" },
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());
  if (result.status === 202) throw redirect("/goodbye", { headers });
  const codes = result.data ?? {};
  const problem: "rateLimited" | "noPassword" | "wrongPassword" | "confirm" | "generic" =
    result.status === 429
      ? "rateLimited"
      : codes.password?.includes("no_password")
        ? "noPassword"
        : codes.password
          ? "wrongPassword"
          : codes.confirm
            ? "confirm"
            : "generic";
  return data({ problem }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function SettingsAccount({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { csrfToken, exportProblem } = loaderData;
  return (
    <div className={styles.narrow}>
      <PageHeader title={t("accountSettings.title")} />

      <Panel title={t("accountSettings.exportTitle")}>
        <Form method="post" action="/account/export" reloadDocument className={styles.form}>
          {exportProblem ? <Notice tone="danger" title={t(`accountSettings.problem.${exportProblem}`)} /> : null}
          <p>{t("accountSettings.exportText")}</p>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <TextField id="export-password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
          <div>
            <Button type="submit" icon={DownloadSimpleIcon}>
              {t("accountSettings.exportSubmit")}
            </Button>
          </div>
        </Form>
      </Panel>

      <Panel title={t("accountSettings.deleteTitle")}>
        <Form method="post" className={styles.form}>
          {actionData?.problem ? <Notice tone="danger" title={t(`accountSettings.problem.${actionData.problem}`)} /> : null}
          <p>{t("accountSettings.deleteText")}</p>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <TextField id="delete-password" name="password" type="password" label={t("login.password")} autoComplete="current-password" required />
          <CheckboxField id="confirm" name="confirm" label={t("accountSettings.deleteConfirm")} required />
          <div>
            <Button type="submit" variant="danger" icon={TrashIcon}>
              {t("accountSettings.deleteSubmit")}
            </Button>
          </div>
        </Form>
      </Panel>
      <p className={styles.aside}>
        {t("accountSettings.noPasswordHint")} <Link to="/password/forgot">{t("login.forgot")}</Link>
      </p>
    </div>
  );
}
