/**
 * Create/edit form for campaigns (WP 3A.2); a plain form, works without JavaScript.
 * Start and end are entered as local date and time in a chosen time zone (owner's decision).
 * Visibility and participation are offered only for drafts: they are frozen after publishing.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { CheckboxGroup, SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { CheckIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { DEFAULT_TIME_ZONE, groupedTimeZones, type CampaignFormValues } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

const SLUG_ERRORS = ["slug_taken", "invalid_slug", "reserved_slug"];
const FIELD_ERRORS = ["ends_before_start", "participation_mismatch", "invalid_timezone"];

export function CampaignForm({
  csrfToken,
  platforms,
  timeZones,
  values,
  errors,
  submitLabel,
  editableAccess,
}: {
  csrfToken: string;
  platforms: { slug: string; name: string }[];
  timeZones: string[];
  values: Partial<CampaignFormValues>;
  errors: Record<string, string>;
  submitLabel: string;
  /** False once published: visibility and participation are shown read-only elsewhere. */
  editableAccess: boolean;
}) {
  const { t } = useTranslation();
  const fieldError = (field: string) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === "slug" && SLUG_ERRORS.includes(code)) return t(`campaigns.errors.${code as "slug_taken"}`);
    if (FIELD_ERRORS.includes(code)) return t(`campaigns.errors.${code as "ends_before_start"}`);
    return t(`campaigns.errors.field.${field as "slug"}`, { defaultValue: t("formError.other") });
  };
  const zone = values.timezone ?? DEFAULT_TIME_ZONE;
  const groups = groupedTimeZones(timeZones);

  return (
    <Form method="post" className={styles.form} noValidate>
      {Object.keys(errors).length ? <Notice tone="danger" title={t("campaigns.problem.invalid")} /> : null}
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value="save" />

      <Panel title={t("campaigns.basics")}>
        <div className={styles.fields}>
          <TextField id="title" name="title" label={t("campaigns.titleField")} maxLength={100} defaultValue={values.title} error={fieldError("title")} required />
          <TextField
            id="slug"
            name="slug"
            label={t("campaigns.slug")}
            hint={t("campaigns.slugHint")}
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.slug}
            error={fieldError("slug")}
            required
          />
          <TextField id="summary" name="summary" label={t("campaigns.summary")} hint={t("campaigns.summaryHint")} maxLength={160} defaultValue={values.summary} error={fieldError("summary")} required />
          <TextField id="version" name="version" label={t("campaigns.version")} hint={t("campaigns.versionHint")} maxLength={50} defaultValue={values.version} error={fieldError("version")} required />
          <TextAreaField id="description" name="description" label={t("campaigns.description")} hint={t("campaigns.markdownHint")} rows={6} maxLength={10000} defaultValue={values.description} error={fieldError("description")} />
          <TextAreaField id="changelog" name="changelog" label={t("campaigns.changelog")} hint={t("campaigns.markdownHint")} rows={5} maxLength={10000} defaultValue={values.changelog} error={fieldError("changelog")} />
        </div>
      </Panel>

      <Panel title={t("campaigns.schedule")}>
        <div className={styles.fields}>
          <div className={styles.row}>
            <TextField id="starts_at" name="starts_at" type="datetime-local" label={t("campaigns.startsAt")} defaultValue={values.starts_at} error={fieldError("starts_at")} required />
            <TextField id="ends_at" name="ends_at" type="datetime-local" label={t("campaigns.endsAt")} defaultValue={values.ends_at} error={fieldError("ends_at")} required />
          </div>
          <SelectField
            id="timezone"
            name="timezone"
            label={t("campaigns.timezone")}
            hint={t("campaigns.timezoneHint")}
            defaultValue={zone}
            error={fieldError("timezone")}
            options={[{ value: DEFAULT_TIME_ZONE, label: DEFAULT_TIME_ZONE }]}
            groups={groups.map((g) => ({ label: g.label, options: g.options.filter((z) => z !== DEFAULT_TIME_ZONE).map((z) => ({ value: z, label: z })) }))}
          />
          <TextField
            id="target_testers"
            name="target_testers"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            label={t("campaigns.targetTesters")}
            hint={t("campaigns.targetTestersHint")}
            defaultValue={values.target_testers ?? "10"}
            error={fieldError("target_testers")}
            required
          />
        </div>
      </Panel>

      <Panel title={t("campaigns.requirements")}>
        <div className={styles.fields}>
          <CheckboxGroup name="platforms" legend={t("campaigns.platforms")} options={platforms.map((p) => ({ value: p.slug, label: p.name }))} selected={values.platforms ?? []} />
          <TextAreaField id="hardware_requirements" name="hardware_requirements" label={t("campaigns.hardware")} hint={t("campaigns.markdownHint")} rows={3} maxLength={4000} defaultValue={values.hardware_requirements} error={fieldError("hardware_requirements")} />
          <TextAreaField id="prerequisites" name="prerequisites" label={t("campaigns.prerequisites")} hint={t("campaigns.markdownHint")} rows={3} maxLength={4000} defaultValue={values.prerequisites} error={fieldError("prerequisites")} />
          <TextAreaField id="methodology" name="methodology" label={t("campaigns.methodology")} hint={t("campaigns.methodologyHint")} rows={4} maxLength={4000} defaultValue={values.methodology} error={fieldError("methodology")} />
        </div>
      </Panel>

      {editableAccess ? (
        <Panel title={t("campaigns.access")}>
          <div className={styles.fields}>
            <fieldset className={styles.radios}>
              <legend className="visually-hidden">{t("campaigns.visibility")}</legend>
              {(["private", "public"] as const).map((v) => (
                <div key={v} className={styles.radio}>
                  <input id={`visibility-${v}`} type="radio" name="visibility" value={v} defaultChecked={(values.visibility ?? "private") === v} aria-describedby={`visibility-${v}-hint`} />
                  <span>
                    <label htmlFor={`visibility-${v}`} className={styles.radioLabel}>
                      {t(`campaigns.visibilities.${v}`)}
                    </label>
                    <span id={`visibility-${v}-hint`} className={styles.radioHint}>
                      {t(`campaigns.visibilityHints.${v}`)}
                    </span>
                  </span>
                </div>
              ))}
            </fieldset>
            <SelectField
              id="participation"
              name="participation"
              label={t("campaigns.participationPublic")}
              hint={t("campaigns.participationHint")}
              defaultValue={values.participation ?? "direct"}
              error={fieldError("participation")}
              options={(["direct", "approval"] as const).map((p) => ({ value: p, label: t(`campaigns.participations.${p}`) }))}
            />
          </div>
        </Panel>
      ) : null}

      <div>
        <Button type="submit" variant="primary" icon={CheckIcon}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
