/** Public profile /u/:username – server-rendered, only what the owner made public (decision D). */
import { useTranslation } from "react-i18next";
import { data } from "react-router";

import type { Route } from "./+types/profile";
import { Avatar, Chips } from "~/components/ui/Data";
import { ArrowSquareOutIcon } from "~/components/ui/icons";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch } from "~/lib/backend.server";
import { cacheHeadersFor } from "~/lib/http";
import { avatarSrc, isValidUsername, linkLabel, type PublicProfile } from "~/lib/profile";

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
  const result = await backendFetch<PublicProfile>(new Request(request.url), `/api/v1/profiles/${username}/`);
  if (result.status !== 200 || !result.data) {
    throw data(null, { status: 404 });
  }
  return data({ profile: result.data }, { headers: cacheHeadersFor(request) });
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
      />
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
