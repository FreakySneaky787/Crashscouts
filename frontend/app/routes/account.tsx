import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/account";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Notice } from "~/components/ui/Notice";
import { Avatar } from "~/components/ui/Data";
import { DatabaseIcon, EyeIcon, LockSimpleIcon, PencilSimpleIcon, PlusIcon, ShieldCheckIcon, SignOutIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Account · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login?next=/account", { headers: privateNoStoreHeaders() });
  }
  const [csrf, projects] = await Promise.all([
    ensureCsrfToken(request),
    backendFetch<{ slug: string; name: string; role: string; visibility: string }[]>(request, "/api/v1/me/projects/"),
  ]);
  const deleted = new URL(request.url).searchParams.get("project") === "deleted";
  return data(
    { username: user.username, csrfToken: csrf.token, projects: projects.data ?? [], deleted },
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
