/**
 * Profile settings: avatar, details and the per-field visibility switches (decision D).
 * Everything works without JavaScript (plain forms; the avatar form is multipart).
 */
import { useTranslation } from "react-i18next";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/settings-profile";
import { Button } from "~/components/ui/Button";
import { Avatar } from "~/components/ui/Data";
import { CheckboxField, CheckboxGroup, TextAreaField, TextField } from "~/components/ui/Form";
import { CheckIcon, EyeIcon, LockSimpleIcon, UploadSimpleIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { brand } from "~/config/brand";
import { backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { avatarSrc, profilePayload, type Catalog, type OwnProfile } from "~/lib/profile";

import styles from "./forms.module.css";

// Same limit as the backend (2 MB image) plus multipart overhead; larger requests are refused
// before the body is read.
const MAX_AVATAR_REQUEST_BYTES = 2 * 1024 * 1024 + 64 * 1024;

type Feedback = { kind: "saved" | "avatarSaved" | "avatarRemoved" } | { kind: "error"; problem: string; fields: string[] };

export function meta(_: Route.MetaArgs) {
  return [{ title: `Profile settings · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login?next=/settings/profile", { headers: privateNoStoreHeaders() });
  }
  const [profile, catalog, csrf] = await Promise.all([
    backendFetch<OwnProfile>(request, "/api/v1/me/profile/"),
    backendFetch<Catalog>(request, "/api/v1/catalog/"),
    ensureCsrfToken(request),
  ]);
  if (profile.status !== 200 || !profile.data || !catalog.data) {
    throw data(null, { status: 502, headers: privateNoStoreHeaders() });
  }
  return data(
    { profile: profile.data, catalog: catalog.data, csrfToken: csrf.token },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

function errorFeedback(status: number, body: unknown): Feedback {
  if (status === 403) return { kind: "error", problem: "forbidden", fields: [] };
  if (status === 429) return { kind: "error", problem: "rateLimited", fields: [] };
  if (status === 400 || status === 413) {
    const fields = body && typeof body === "object" ? Object.keys(body) : [];
    return { kind: "error", problem: "invalid", fields };
  }
  return { kind: "error", problem: "generic", fields: [] };
}

export async function action({ request }: Route.ActionArgs) {
  const headers = privateNoStoreHeaders();
  const length = Number(request.headers.get("Content-Length") ?? "NaN");
  if (!Number.isFinite(length) || length > MAX_AVATAR_REQUEST_BYTES) {
    return data<{ feedback: Feedback }>(
      { feedback: { kind: "error", problem: "invalid", fields: ["avatar"] } },
      { status: 413, headers },
    );
  }
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = form.get("intent");

  if (intent === "avatar") {
    const file = form.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return data<{ feedback: Feedback }>({ feedback: { kind: "error", problem: "invalid", fields: ["avatar"] } }, { status: 400, headers });
    }
    const upload = new FormData();
    upload.set("avatar", file, file.name);
    const result = await backendFetch(request, "/api/v1/me/profile/avatar/", { method: "PUT", csrfToken, form: upload });
    if (result.status === 200) return data<{ feedback: Feedback }>({ feedback: { kind: "avatarSaved" } }, { headers });
    return data({ feedback: errorFeedback(result.status, result.data) }, { status: 400, headers });
  }

  if (intent === "remove-avatar") {
    const result = await backendFetch(request, "/api/v1/me/profile/avatar/", { method: "DELETE", csrfToken });
    if (result.status === 200) return data<{ feedback: Feedback }>({ feedback: { kind: "avatarRemoved" } }, { headers });
    return data({ feedback: errorFeedback(result.status, result.data) }, { status: 400, headers });
  }

  const result = await backendFetch(request, "/api/v1/me/profile/", {
    method: "PATCH",
    csrfToken,
    json: profilePayload(form),
  });
  if (result.status === 200) return data<{ feedback: Feedback }>({ feedback: { kind: "saved" } }, { headers });
  return data({ feedback: errorFeedback(result.status, result.data) }, { status: 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

export default function SettingsProfile({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { profile, catalog, csrfToken } = loaderData;
  const feedback = actionData?.feedback;
  const failed = feedback?.kind === "error" ? feedback.fields : [];
  const fieldError = (field: string, key: "bioTooLong" | "httpsLink" | "listInvalid" | "avatarInvalid") =>
    failed.includes(field) ? t(`settings.errors.${key}`) : undefined;
  const options = (items: { slug: string; name: string }[]) => items.map((item) => ({ value: item.slug, label: item.name }));

  return (
    <div className={styles.stack}>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.intro")}
        actions={
          <Link to={`/u/${profile.username}`} className={styles.textLink}>
            <EyeIcon aria-hidden="true" className={styles.inlineIcon} /> {t("settings.viewPublic")}
          </Link>
        }
      />

      {feedback && feedback.kind !== "error" ? <Notice tone="ok" title={t(`settings.feedback.${feedback.kind}`)} /> : null}
      {feedback?.kind === "error" ? <Notice tone="danger" title={t(`settings.problem.${feedback.problem}` as "settings.problem.invalid")} /> : null}

      <Panel title={t("settings.avatar")}>
        <div className={styles.avatarRow}>
          <Avatar name={profile.username} id={profile.username} size="lg" src={avatarSrc(profile.avatar_key)} />
          <div className={styles.stack}>
            <Form method="post" encType="multipart/form-data" className={styles.form}>
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <input type="hidden" name="intent" value="avatar" />
              <TextField
                id="avatar"
                name="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                label={t("settings.avatarFile")}
                hint={t("settings.avatarHint")}
                error={fieldError("avatar", "avatarInvalid")}
                required
              />
              <div>
                <Button type="submit" icon={UploadSimpleIcon}>
                  {t("settings.avatarUpload")}
                </Button>
              </div>
            </Form>
            {profile.avatar_key ? (
              <Form method="post">
                <input type="hidden" name="csrf_token" value={csrfToken} />
                <input type="hidden" name="intent" value="remove-avatar" />
                <Button type="submit" variant="quiet" size="sm" icon={XIcon}>
                  {t("settings.avatarRemove")}
                </Button>
              </Form>
            ) : null}
          </div>
        </div>
      </Panel>

      <Form method="post" className={styles.stack}>
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <input type="hidden" name="intent" value="profile" />
        <Panel title={t("settings.details")}>
          <div className={styles.form}>
            <p className={styles.note}>
              <LockSimpleIcon aria-hidden="true" className={styles.inlineIcon} /> {t("settings.privacyNote")}
            </p>
            <TextAreaField
              id="bio"
              name="bio"
              label={t("settings.bio")}
              hint={t("settings.bioHint")}
              rows={4}
              maxLength={500}
              defaultValue={profile.bio}
              error={fieldError("bio", "bioTooLong")}
            />
            <CheckboxField id="show_bio" name="show_bio" label={t("settings.showOnProfile")} defaultChecked={profile.show_bio} />
            <TextField
              id="link"
              name="link"
              type="url"
              label={t("settings.link")}
              hint={t("settings.linkHint")}
              placeholder="https://"
              defaultValue={profile.link}
              error={fieldError("link", "httpsLink")}
            />
            <CheckboxField id="show_link" name="show_link" label={t("settings.showOnProfile")} defaultChecked={profile.show_link} />
            <CheckboxGroup
              name="interests"
              legend={t("profile.interests")}
              options={options(catalog.categories)}
              selected={profile.interests}
              error={fieldError("interests", "listInvalid")}
            />
            <CheckboxField id="show_interests" name="show_interests" label={t("settings.showOnProfile")} defaultChecked={profile.show_interests} />
            <CheckboxGroup
              name="platforms"
              legend={t("profile.platforms")}
              options={options(catalog.platforms)}
              selected={profile.platforms}
              error={fieldError("platforms", "listInvalid")}
            />
            <CheckboxField id="show_platforms" name="show_platforms" label={t("settings.showOnProfile")} defaultChecked={profile.show_platforms} />
            <CheckboxGroup
              name="skills"
              legend={t("profile.skills")}
              options={options(catalog.skills)}
              selected={profile.skills}
              error={fieldError("skills", "listInvalid")}
            />
            <CheckboxField id="show_skills" name="show_skills" label={t("settings.showOnProfile")} defaultChecked={profile.show_skills} />
          </div>
        </Panel>
        <Panel title={t("settings.searchEngines")}>
          <CheckboxField id="indexable" name="indexable" label={t("settings.indexable")} defaultChecked={profile.indexable} />
        </Panel>
        <div>
          <Button type="submit" variant="primary" icon={CheckIcon}>
            {t("settings.save")}
          </Button>
        </div>
      </Form>
    </div>
  );
}
