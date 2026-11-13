/**
 * Download links on the campaign's edit page (WP 3A.3): list, remove, add. Plain forms.
 * Links are shown to testers only behind the warning page.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { RowList } from "~/components/ui/Data";
import { SelectField, TextField } from "~/components/ui/Form";
import { DownloadSimpleIcon, PlusIcon, ShieldCheckIcon, WarningIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import type { CampaignLink } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

const MAX_LINKS = 10;

export function LinksPanel({
  links,
  platforms,
  csrfToken,
  editable,
  errors,
  values,
  done,
}: {
  links: CampaignLink[];
  platforms: { slug: string; name: string }[];
  csrfToken: string;
  editable: boolean;
  errors: Record<string, string>;
  values: { label?: string; url?: string; platform?: string | null; sha256?: string } | null;
  done: "added" | "removed" | null;
}) {
  const { t } = useTranslation();
  const fieldError = (field: string) => {
    const code = errors[field];
    if (!code) return undefined;
    return t(`campaigns.links.errors.${field as "url"}`, { defaultValue: t("formError.other") });
  };
  return (
    <Panel title={t("campaigns.links.title")} flush={false}>
      <div className={styles.fields}>
        <p className={styles.radioHint}>{t("campaigns.links.intro")}</p>
        {done ? <Notice tone="ok" title={t(`campaigns.links.done.${done}`)} /> : null}
        {links.length ? (
          <RowList
            label={t("campaigns.links.title")}
            rows={links.map((link) => ({
              key: link.id,
              icon: DownloadSimpleIcon,
              primary: link.label,
              secondary: (
                <>
                  <code>{link.host}</code>
                  {link.platform ? ` · ${link.platform.name}` : ""}
                  {link.sha256 ? ` · ${t("campaigns.links.hasChecksum")}` : ""}
                </>
              ),
              trailing: (
                <span className={styles.trail}>
                  {link.suspended ? <StatusPill tone="danger" icon={WarningIcon} label={t("campaigns.links.suspended")} /> : null}
                  {link.in_repository ? <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("campaigns.links.inRepository")} /> : null}
                  {editable && !link.suspended ? (
                    <Form method="post">
                      <input type="hidden" name="csrf_token" value={csrfToken} />
                      <input type="hidden" name="intent" value="link-remove" />
                      <input type="hidden" name="link" value={link.id} />
                      <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("campaigns.links.removeNamed", { label: link.label })}>
                        {t("campaigns.links.remove")}
                      </Button>
                    </Form>
                  ) : null}
                </span>
              ),
            }))}
          />
        ) : (
          <p className={styles.radioHint}>{t("campaigns.links.none")}</p>
        )}
        {editable && links.length < MAX_LINKS ? (
          <Form method="post" className={styles.fields} noValidate>
            <h3 className={styles.radioLabel}>{t("campaigns.links.add")}</h3>
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <input type="hidden" name="intent" value="link-add" />
            <TextField id="link-label" name="label" label={t("campaigns.links.label")} hint={t("campaigns.links.labelHint")} maxLength={80} defaultValue={values?.label} error={fieldError("label")} required />
            <TextField id="link-url" name="url" type="url" label={t("campaigns.links.url")} hint={t("campaigns.links.urlHint")} placeholder="https://" maxLength={500} defaultValue={values?.url} error={fieldError("url")} required />
            <SelectField
              id="link-platform"
              name="platform"
              label={t("campaigns.links.platform")}
              defaultValue={values?.platform ?? ""}
              error={fieldError("platform")}
              options={[{ value: "", label: t("campaigns.links.anyPlatform") }, ...platforms.map((p) => ({ value: p.slug, label: p.name }))]}
            />
            <TextField
              id="link-sha256"
              name="sha256"
              label={t("campaigns.links.sha256")}
              hint={t("campaigns.links.sha256Hint")}
              maxLength={100}
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={values?.sha256}
              error={fieldError("sha256")}
            />
            <div>
              <Button type="submit" icon={PlusIcon}>
                {t("campaigns.links.addButton")}
              </Button>
            </div>
          </Form>
        ) : null}
      </div>
    </Panel>
  );
}
