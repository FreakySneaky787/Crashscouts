/** Create/edit form for projects (WP 2.2b); a plain form, works without JavaScript. */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { CheckboxGroup, SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { CheckIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import type { Catalog } from "~/lib/profile";
import { COMMON_LICENSES, PROJECT_STATUSES, type License, type ProjectFormValues } from "~/lib/projects";

import styles from "./ProjectForm.module.css";

const KNOWN_ERRORS = ["slug_taken", "invalid_slug", "reserved_slug"];

export function ProjectForm({
  csrfToken,
  catalog,
  licenses,
  values,
  errors,
  problem,
  submitLabel,
  intent,
}: {
  csrfToken: string;
  catalog: Catalog & { languages: { slug: string; name: string }[]; software_types: { slug: string; name: string }[] };
  licenses: License[];
  values: Partial<ProjectFormValues>;
  errors: Record<string, string>;
  problem: string | null;
  submitLabel: string;
  intent?: string;
}) {
  const { t } = useTranslation();
  const fieldError = (field: string) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === "slug" && KNOWN_ERRORS.includes(code)) return t(`projects.errors.${code as "slug_taken"}`);
    return t(`projects.errors.field.${field as "slug"}`, { defaultValue: t("formError.other") });
  };
  const common = new Set<string>(COMMON_LICENSES);
  const byId = new Map(licenses.map((l) => [l.spdx_id, l]));
  const label = (l: License) => (l.spdx_id === "LicenseRef-Proprietary" ? t("projects.proprietary") : `${l.spdx_id} – ${l.name}`);
  const options = (items: { slug: string; name: string }[]) => items.map((i) => ({ value: i.slug, label: i.name }));

  return (
    <Form method="post" className={styles.form} noValidate>
      {problem ? <Notice tone="danger" title={t(`projects.problem.${problem as "generic"}`)} /> : null}
      {Object.keys(errors).length ? <Notice tone="danger" title={t("projects.problem.invalid")} /> : null}
      <input type="hidden" name="csrf_token" value={csrfToken} />
      {intent ? <input type="hidden" name="intent" value={intent} /> : null}

      <Panel title={t("projects.basics")}>
        <div className={styles.fields}>
          <TextField id="name" name="name" label={t("projects.name")} maxLength={80} defaultValue={values.name} error={fieldError("name")} required />
          <TextField
            id="slug"
            name="slug"
            label={t("projects.slug")}
            hint={t("projects.slugHint")}
            maxLength={40}
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.slug}
            error={fieldError("slug")}
            required
          />
          <TextField
            id="summary"
            name="summary"
            label={t("projects.summary")}
            hint={t("projects.summaryHint")}
            maxLength={160}
            defaultValue={values.summary}
            error={fieldError("summary")}
            required
          />
          <TextAreaField
            id="description"
            name="description"
            label={t("projects.description")}
            hint={t("projects.descriptionHint")}
            rows={8}
            maxLength={10000}
            defaultValue={values.description}
            error={fieldError("description")}
          />
          <TextField
            id="repository_url"
            name="repository_url"
            type="url"
            label={t("projects.repository")}
            hint={t("projects.repositoryHint")}
            placeholder="https://"
            defaultValue={values.repository_url}
            error={fieldError("repository_url")}
          />
        </div>
      </Panel>

      <Panel title={t("projects.classification")}>
        <div className={styles.fields}>
          <SelectField
            id="status"
            name="status"
            label={t("projects.status")}
            defaultValue={values.status ?? "development"}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: t(`projects.statuses.${s}`) }))}
          />
          <SelectField
            id="license"
            name="license"
            label={t("projects.license")}
            hint={t("projects.licenseHint")}
            defaultValue={values.license ?? "MIT"}
            error={fieldError("license")}
            options={COMMON_LICENSES.filter((id) => byId.has(id)).map((id) => ({ value: id, label: label(byId.get(id)!) }))}
            groups={[{ label: t("projects.allLicenses"), options: licenses.filter((l) => !common.has(l.spdx_id)).map((l) => ({ value: l.spdx_id, label: label(l) })) }]}
          />
          <CheckboxGroup name="categories" legend={t("projects.categories")} options={options(catalog.categories)} selected={values.categories ?? []} />
          <CheckboxGroup name="software_types" legend={t("projects.software_types")} options={options(catalog.software_types)} selected={values.software_types ?? []} />
          <CheckboxGroup name="platforms" legend={t("projects.platforms")} options={options(catalog.platforms)} selected={values.platforms ?? []} />
          <CheckboxGroup name="languages" legend={t("projects.languages")} options={options(catalog.languages)} selected={values.languages ?? []} />
        </div>
      </Panel>

      <Panel title={t("projects.visibility")}>
        <fieldset className={styles.radios}>
          <legend className="visually-hidden">{t("projects.visibility")}</legend>
          {(["private", "public"] as const).map((v) => (
            <div key={v} className={styles.radio}>
              <input
                id={`visibility-${v}`}
                type="radio"
                name="visibility"
                value={v}
                defaultChecked={(values.visibility ?? "private") === v}
                aria-describedby={`visibility-${v}-hint`}
              />
              <span>
                <label htmlFor={`visibility-${v}`} className={styles.radioLabel}>
                  {t(`projects.visibilities.${v}`)}
                </label>
                <span id={`visibility-${v}-hint`} className={styles.radioHint}>
                  {t(`projects.visibilityHints.${v}`)}
                </span>
              </span>
            </div>
          ))}
        </fieldset>
      </Panel>

      <div>
        <Button type="submit" variant="primary" icon={CheckIcon}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
