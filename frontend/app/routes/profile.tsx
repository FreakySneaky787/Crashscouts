/** Public profile /u/:username – server-rendered, only what the owner made public (decision D). */
import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/profile";
import { ButtonLink } from "~/components/ui/Button";
import { Avatar, Chips } from "~/components/ui/Data";
import { ArrowSquareOutIcon, FlagIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, getSessionUser, withoutCookies } from "~/lib/backend.server";
import { cacheHeadersFor, hasSessionCookie } from "~/lib/http";
import { avatarSrc, isValidUsername, linkLabel, type PublicProfile } from "~/lib/profile";
import { reportHref } from "~/lib/reports";

import styles from "./forms.module.css";

export function meta({ loaderData }: Route.MetaArgs) {
  const username = loaderData?.profile.username;
  return [
    { title: `${username ?? "Profile"} · ${brand.name}` },
    // Indexing only after the owner's explicit opt-in.
    { name: "robots", content: loaderData?.profile.indexable ? "index, follow" : "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const username = params.username?.toLowerCase();
  if (!isValidUsername(username)) {
    throw data(null, { status: 404 });
  }
  // Public data only: the request is made without the visitor's cookies.
  const result = await backendFetch<PublicProfile>(withoutCookies(request), `/api/v1/profiles/${username}/`);
  if (result.status !== 200 || !result.data) {
    throw data(null, { status: 404 });
  }
  // Everyone but the person themself sees "Report" (WP 7.1); visitors are asked to sign in first.
  const viewer = hasSessionCookie(request) ? await getSessionUser(request) : null;
  const reported = new URL(request.url).searchParams.get("reported") === "1";
  return data({ profile: result.data, own: viewer?.username === result.data.username, reported }, { headers: cacheHeadersFor(request) });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { profile } = loaderData;
  const lists = (["interests", "platforms", "skills"] as const).filter((field) => profile[field]?.length);
  const hasDetails = Boolean(profile.bio || profile.link || lists.length);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={profile.username}
        leading={<Avatar name={profile.username} id={profile.username} size="lg" src={avatarSrc(profile.avatar_key)} />}
        actions={
          loaderData.own ? null : (
            <ButtonLink to={reportHref({ type: "user", project: "", username: profile.username })} variant="quiet" icon={FlagIcon}>
              {t("reports.action")}
            </ButtonLink>
          )
        }
      />
      {loaderData.reported ? <Notice tone="ok" title={t("reports.thanks")} /> : null}
      {hasDetails ? (
        <Panel title={t("profile.about")}>
          <div className={styles.stack}>
            {profile.bio ? <p className={styles.prose}>{profile.bio}</p> : null}
            {profile.link ? (
              <p>
                <a href={profile.link} rel="nofollow ugc noopener noreferrer" target="_blank">
                  {linkLabel(profile.link)}
                  <ArrowSquareOutIcon aria-hidden="true" className={styles.inlineIcon} />
                  <span className="visually-hidden"> {t("profile.opensNewTab")}</span>
                </a>
              </p>
            ) : null}
            {lists.map((field) => (
              <div key={field} className={styles.stackTight}>
                <h2 className={styles.subhead}>{t(`profile.${field}`)}</h2>
                <Chips label={t(`profile.${field}`)} items={(profile[field] ?? []).map((item) => item.name)} />
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <p className={styles.muted}>{t("profile.nothingPublic")}</p>
      )}
    </div>
  );
}
