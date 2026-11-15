/**
 * Privacy policy, terms of use and imprint (WP 8.5, ADR 0031). Drafts as Markdown in
 * `app/legal/`, rendered with the allowlist Markdown component. The operator's details come from
 * the SSR server's environment, never from the repository; until the owner confirms the
 * professional review (`LEGAL_TEXTS_REVIEWED=true`) every page says it is a draft.
 */
import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/legal";
import { Markdown } from "~/components/ui/Markdown";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { cacheHeadersFor } from "~/lib/http";
import { LEGAL_PAGES, fillLegalText, isLegalSlug, legalTextsReviewed, type LegalSlug } from "~/lib/legal";
import imprint from "~/legal/imprint.md?raw";
import privacy from "~/legal/privacy.md?raw";
import terms from "~/legal/terms.md?raw";

import styles from "./forms.module.css";

const TEXTS: Record<LegalSlug, string> = { privacy, terms, imprint };

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData ? LEGAL_PAGES[loaderData.slug].title : "Legal"} · ${brand.name}` }];
}

export function loader({ request }: Route.LoaderArgs) {
  // Client-side navigation fetches "/privacy.data" (React Router's single fetch): strip it.
  const slug = new URL(request.url).pathname.replace(/^\//, "").replace(/\.data$/, "");
  if (!isLegalSlug(slug)) throw data(null, { status: 404 });
  return data(
    { slug, text: fillLegalText(TEXTS[slug], process.env, brand.name), reviewed: legalTextsReviewed(process.env) },
    { headers: cacheHeadersFor(request) },
  );
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function LegalPage({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const page = LEGAL_PAGES[loaderData.slug];
  return (
    <div className={styles.narrow}>
      <PageHeader title={page.title} subtitle={t("legal.updated", { date: page.updated, version: page.version })} />
      <div className={styles.stack}>
        {loaderData.reviewed ? null : <Notice tone="info" title={t("legal.draft")} />}
        <Panel title={page.title}>
          <Markdown>{loaderData.text}</Markdown>
        </Panel>
      </div>
    </div>
  );
}
