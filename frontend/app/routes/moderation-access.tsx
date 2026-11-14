/**
 * Read-only view of reported content through a moderator's purpose-bound access (WP 7.3,
 * ADR 0028). Only the moderator who opened the access, only for 24 hours; every view is audited.
 * Texts are shown as plain text; download links as text, never as links; files by name only.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/moderation-access";
import { ButtonLink } from "~/components/ui/Button";
import { FactList } from "~/components/ui/Data";
import { ArrowLeftIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser } from "~/lib/backend.server";
import { formatInZone } from "~/lib/campaigns";
import { isUuid, privateNoStoreHeaders } from "~/lib/http";
import type { ModeratorAccess } from "~/lib/moderation";

import styles from "./forms.module.css";
import table from "./moderation-suspensions.module.css";

type Content = Record<string, string | boolean | string[] | { label: string; url: string }[]>;
type AccessContent = ModeratorAccess & { target_id: string; case_type: string; content: Content };

export function meta(_: Route.MetaArgs) {
  return [{ title: `Reported content · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!isUuid(params.id)) throw data(null, { status: 404 });
  if (!(await getSessionUser(request))) throw redirect("/login?next=%2Fmoderation", { headers: privateNoStoreHeaders() });
  const result = await backendFetch<AccessContent>(request, `/api/v1/moderation/accesses/${params.id}/`);
  if (result.status !== 200 || !result.data) throw data(null, { status: 404, headers: privateNoStoreHeaders() });
  return data({ access: result.data }, { headers: privateNoStoreHeaders() });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

const TEXTS = ["summary", "description", "changelog", "prerequisites", "steps", "expected", "actual", "suggestion", "solution", "environment", "location"];

export default function ModerationAccess({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { access } = loaderData;
  const content = access.content;
  const field = (key: string) => t(`access.fields.${key}`, { defaultValue: key });
  const facts = Object.entries(content)
    .filter(([key, value]) => !TEXTS.includes(key) && (typeof value === "string" || typeof value === "boolean"))
    .map(([key, value]) => ({ label: field(key), value: typeof value === "boolean" ? t(value ? "access.yes" : "access.no") : String(value) || "–" }));
  const links = (content.links ?? []) as { label: string; url: string }[];
  const files = (content.attachments ?? []) as string[];
  const campaigns = (content.campaigns ?? []) as string[];
  return (
    <div className={styles.stack}>
      <PageHeader
        breadcrumbs={[{ label: t("moderation.title"), to: "/moderation" }, { label: access.target_label }]}
        title={t("access.contentTitle")}
        subtitle={access.target_label}
      />
      <Notice tone="info" title={t("access.notice", { end: `${formatInZone(access.expires_at, "UTC")} UTC` })}>
        {t("access.yourReason", { reason: access.reason })}
      </Notice>
      <Panel title={t("access.facts")}>
        <FactList items={facts} />
      </Panel>
      {TEXTS.filter((key) => typeof content[key] === "string" && content[key]).map((key) => (
        <Panel key={key} title={field(key)}>
          <p className={`${styles.prose} ${table.text}`}>
            {String(content[key])}
          </p>
        </Panel>
      ))}
      {links.length ? (
        <Panel title={t("access.links")}>
          <ul className={styles.plainList} aria-label={t("access.links")}>
            {links.map((link) => (
              <li key={link.url} className={styles.stackTight}>
                <strong>{link.label}</strong>
                <code className={styles.secret}>{link.url}</code>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {files.length ? (
        <Panel title={t("access.files")}>
          <ul className={styles.plainList} aria-label={t("access.files")}>
            {files.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {campaigns.length ? (
        <Panel title={t("access.campaigns")}>
          <ul className={styles.plainList} aria-label={t("access.campaigns")}>
            {campaigns.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <div>
        <ButtonLink to={`/moderation/${access.case_type}/${access.target_id}`} variant="quiet" icon={ArrowLeftIcon}>
          {t("access.backToCase")}
        </ButtonLink>
      </div>
    </div>
  );
}
