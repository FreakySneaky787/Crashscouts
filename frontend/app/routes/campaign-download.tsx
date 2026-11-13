/**
 * Warning page before a download link (WP 3A.3; docs/SECURITY.md, section 4). Shown to the team
 * and participants only (404 for everyone else). Never redirects by itself: the person reads
 * where the link leads and decides.
 */
import { useTranslation } from "react-i18next";
import { data, redirect } from "react-router";

import type { Route } from "./+types/campaign-download";
import { ButtonLink, ExternalButtonLink } from "~/components/ui/Button";
import { FactList } from "~/components/ui/Data";
import { ArrowLeftIcon, ArrowSquareOutIcon, ShieldCheckIcon, WarningIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { groupedChecksum, type Campaign, type CampaignLink } from "~/lib/campaigns";
import { isUuid, privateNoStoreHeaders } from "~/lib/http";
import { isValidProjectSlug } from "~/lib/projects";

import styles from "./forms.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Download link · ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.slug?.toLowerCase();
  const campaignSlug = params.campaign?.toLowerCase();
  if (!isValidProjectSlug(slug) || !isValidProjectSlug(campaignSlug) || !isUuid(params.id)) throw data(null, { status: 404 });
  const api = `/api/v1/projects/${slug}/campaigns/${campaignSlug}/`;
  const [campaign, link] = await Promise.all([backendFetch<Campaign>(request, api), backendFetch<CampaignLink>(request, `${api}links/${params.id}/`)]);
  const headers = privateNoStoreHeaders();
  if (campaign.status !== 200 || !campaign.data || link.status !== 200 || !link.data) throw data(null, { status: 404, headers });
  if (campaign.data.slug !== params.campaign || campaign.data.project !== params.slug) {
    throw redirect(`/p/${campaign.data.project}/c/${campaign.data.slug}/download/${params.id}`, { headers });
  }
  return data({ campaign: campaign.data, link: link.data }, { headers });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function CampaignDownload({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { campaign, link } = loaderData;
  const back = `/p/${campaign.project}/c/${campaign.slug}`;
  return (
    <div className={styles.narrow}>
      <PageHeader
        breadcrumbs={[{ label: campaign.title, to: back }, { label: t("campaigns.download.crumb") }]}
        title={t("campaigns.download.title", { host: link.host })}
        subtitle={t("campaigns.download.subtitle", { brand: brand.name })}
      />
      <div className={styles.stack}>
        <Notice tone="info" title={t("campaigns.download.notice", { brand: brand.name })}>
          {t("campaigns.download.noticeText")}
        </Notice>
        <Panel title={link.label}>
          <div className={styles.stack}>
            <FactList
              items={[
                { label: t("campaigns.download.domain"), value: <strong data-testid="download-host">{link.host}</strong> },
                {
                  label: t("campaigns.download.address"),
                  value: (
                    <code className={styles.secret} data-testid="download-url">
                      {link.url}
                    </code>
                  ),
                },
                {
                  label: t("campaigns.download.source"),
                  value: link.in_repository ? (
                    <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("campaigns.links.inRepository")} />
                  ) : (
                    <StatusPill tone="warn" icon={WarningIcon} label={t("campaigns.download.notInRepository")} />
                  ),
                },
                ...(link.platform ? [{ label: t("campaigns.links.platform"), value: link.platform.name }] : []),
              ]}
            />
            {link.sha256 ? (
              <div className={styles.stackTight}>
                <h3 className={styles.subhead}>{t("campaigns.download.checksumTitle")}</h3>
                <p>{t("campaigns.download.checksumText")}</p>
                <code className={styles.secret} data-testid="download-sha256">
                  {groupedChecksum(link.sha256)}
                </code>
                <ul className={styles.plainList}>
                  <li>
                    Windows (PowerShell): <code>Get-FileHash .\FILE -Algorithm SHA256</code>
                  </li>
                  <li>
                    macOS: <code>shasum -a 256 FILE</code>
                  </li>
                  <li>
                    Linux: <code>sha256sum FILE</code>
                  </li>
                </ul>
              </div>
            ) : (
              <p className={styles.muted}>{t("campaigns.download.noChecksum")}</p>
            )}
            <div className={styles.buttonRow}>
              <ExternalButtonLink href={link.url} icon={ArrowSquareOutIcon}>
                {t("campaigns.download.continue", { host: link.host })}
              </ExternalButtonLink>
              <ButtonLink to={back} variant="quiet" icon={ArrowLeftIcon}>
                {t("campaigns.download.back")}
              </ButtonLink>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
