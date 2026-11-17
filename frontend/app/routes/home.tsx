/**
 * Home (WP 8.9, ADR 0035). Visitors see what Crashscouts is, for whom, how it works and the open
 * test campaigns. Signed-in people see a short welcome with their next steps and the same
 * campaigns. Stays in the workbench style, only more generous (owner's decision 2026-11-17).
 */
import { useTranslation } from "react-i18next";
import { data, Link, useRouteLoaderData } from "react-router";

import type { Route } from "./+types/home";
import { CampaignArt, FeedbackArt, HeroIllustration, TestersArt } from "~/components/brand/Illustrations";
import { CampaignCard } from "~/components/discover/DiscoverCards";
import { ButtonLink } from "~/components/ui/Button";
import { EmptyState } from "~/components/ui/EmptyState";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import type { DiscoverCampaign, DiscoverPage } from "~/lib/discover";
import { cacheHeadersFor } from "~/lib/http";
import { socialMeta } from "~/lib/social";
import type { loader as rootLoader } from "~/root";

import styles from "./home.module.css";

/** How many open campaigns the home page shows. */
const CAMPAIGNS_SHOWN = 4;

const DESCRIPTION = "Publish a test campaign and get structured feedback from volunteer testers. Free, open source (AGPL), no tracking.";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = `${brand.name} · Real testers for your open-source project`;
  return [
    { title },
    { name: "description", content: DESCRIPTION },
    ...(loaderData ? socialMeta({ url: loaderData.url, title, description: DESCRIPTION }) : []),
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const result = await backendFetch<DiscoverPage<DiscoverCampaign>>(request, "/api/v1/discover/campaigns/");
  const campaigns = result.status === 200 && result.data ? result.data.results.slice(0, CAMPAIGNS_SHOWN) : [];
  return data({ campaigns, url: new URL("/", request.url).toString() }, { headers: cacheHeadersFor(request) });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const user = useRouteLoaderData<typeof rootLoader>("root")?.user ?? null;
  const steps = [
    { art: CampaignArt, title: t("home.step1Title"), text: t("home.step1Text") },
    { art: TestersArt, title: t("home.step2Title"), text: t("home.step2Text") },
    { art: FeedbackArt, title: t("home.step3Title"), text: t("home.step3Text") },
  ];

  return (
    <div className={styles.page}>
      {user ? (
        <section className={styles.welcome} aria-labelledby="home-title">
          <h1 id="home-title">{t("home.welcomeBack", { username: user.username })}</h1>
          <p className={styles.lead}>{t("home.welcomeText")}</p>
          <div className={styles.actions}>
            <ButtonLink to="/projects/new" variant="primary">
              {t("home.ctaCreate")}
            </ButtonLink>
            <ButtonLink to="/discover?tab=campaigns">{t("home.ctaTest")}</ButtonLink>
          </div>
        </section>
      ) : (
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroText}>
            <h1 id="home-title" className={styles.headline}>
              {t("home.headline")}
            </h1>
            <p className={styles.lead}>{t("home.lead")}</p>
            <div className={styles.actions}>
              <ButtonLink to="/signup" variant="primary">
                {t("home.ctaNeedTesters")}
              </ButtonLink>
              <ButtonLink to="/discover?tab=campaigns">{t("home.ctaWantToTest")}</ButtonLink>
            </div>
            <p className={styles.facts}>{t("home.facts")}</p>
          </div>
          <HeroIllustration className={styles.heroArt} />
        </section>
      )}

      {user ? null : (
        <section className={styles.how} aria-labelledby="home-how">
          <h2 id="home-how">{t("home.howTitle")}</h2>
          <ol className={styles.steps}>
            {steps.map(({ art: Art, title, text }) => (
              <li key={title} className={styles.step}>
                <Art className={styles.stepArt} />
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepText}>{text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Panel
        title={t("home.campaignsTitle")}
        aside={
          <Link to="/discover?tab=campaigns" className={styles.more}>
            {t("home.campaignsAll")}
          </Link>
        }
      >
        {loaderData.campaigns.length ? (
          <ul className={styles.campaigns} aria-label={t("home.campaignsTitle")}>
            {loaderData.campaigns.map((c) => (
              <CampaignCard key={`${c.project}/${c.slug}`} campaign={c} headingLevel={3} />
            ))}
          </ul>
        ) : (
          <EmptyState kind="first-use" title={t("home.campaignsEmptyTitle")} action={<Link to="/discover">{t("home.campaignsEmptyAction")}</Link>}>
            {t("home.campaignsEmptyText")}
          </EmptyState>
        )}
      </Panel>

      {user ? null : (
        <section className={styles.why} aria-labelledby="home-why">
          <h2 id="home-why">{t("home.whyTitle")}</h2>
          <ul className={styles.reasons}>
            <li>
              <strong>{t("home.why1Title")}</strong> {t("home.why1Text")}
            </li>
            <li>
              <strong>{t("home.why2Title")}</strong> {t("home.why2Text")}
            </li>
            <li>
              <strong>{t("home.why3Title")}</strong> {t("home.why3Text")}
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
