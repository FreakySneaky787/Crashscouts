/**
 * The feedback form (WP 5.3, ADR 0024) for one chosen kind: the common fields plus the kind's own
 * fields. A plain form that works without JavaScript; the kind is chosen beforehand.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { PaperPlaneTiltIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { FEEDBACK_RESULTS, KIND_FIELDS, REQUIRED_FIELDS, type FeedbackField, type FeedbackKind } from "~/lib/feedback";

import styles from "./Feedback.module.css";

const LONG_FIELDS: FeedbackField[] = ["steps", "expected", "actual", "suggestion", "solution"];

export function FeedbackForm({
  kind,
  values,
  errors,
  platforms,
  tasks,
  csrfToken,
  intent,
  submitLabel,
}: {
  kind: FeedbackKind;
  values: Record<string, string>;
  errors: Record<string, string>;
  platforms: { slug: string; name: string }[];
  tasks: { id: string; title: string }[];
  csrfToken: string;
  intent: string;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const required = REQUIRED_FIELDS[kind] ?? [];
  const error = (field: string) => (errors[field] ? t(`feedback.errors.${field as "title"}`, { defaultValue: t("formError.other") }) : undefined);

  const field = (name: FeedbackField) => {
    const id = `feedback-${name}`;
    const isRequired = required.includes(name);
    if (name === "platform") {
      return (
        <SelectField
          key={name}
          id={id}
          name={name}
          label={t(isRequired ? "feedback.fields.platform" : "feedback.fields.platformOptional")}
          defaultValue={values.platform ?? ""}
          error={error(name)}
          options={[{ value: "", label: t("feedback.fields.anyPlatform") }, ...platforms.map((p) => ({ value: p.slug, label: p.name }))]}
        />
      );
    }
    if (name === "result") {
      return (
        <SelectField
          key={name}
          id={id}
          name={name}
          label={t("feedback.fields.result")}
          defaultValue={values.result ?? ""}
          error={error(name)}
          options={[{ value: "", label: "–" }, ...FEEDBACK_RESULTS.map((r) => ({ value: r, label: t(`feedback.results.${r}`) }))]}
        />
      );
    }
    const label = t(`feedback.fields.${name}`);
    const hint = name === "steps" || name === "version" || name === "environment" ? t(`feedback.hints.${name}`) : undefined;
    if (LONG_FIELDS.includes(name)) {
      return <TextAreaField key={name} id={id} name={name} label={label} hint={hint} rows={4} maxLength={4000} defaultValue={values[name]} error={error(name)} required={isRequired} />;
    }
    const maxLength = name === "location" ? 200 : name === "environment" ? 300 : 50;
    return <TextField key={name} id={id} name={name} label={label} hint={hint} maxLength={maxLength} defaultValue={values[name]} error={error(name)} />;
  };

  return (
    <Form method="post" className={styles.form} noValidate>
      {Object.keys(errors).length ? <Notice tone="danger" title={t("feedback.problem.invalid")} /> : null}
      <Notice tone="info" title={t("feedback.privacyNotice")} />
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="kind" value={kind} />
      <TextField id="feedback-title" name="title" label={t("feedback.fields.title")} maxLength={120} defaultValue={values.title} error={error("title")} required />
      <TextAreaField
        id="feedback-description"
        name="description"
        label={t(kind === "feature" ? "feedback.fields.descriptionFeature" : "feedback.fields.description")}
        hint={t("feedback.hints.description")}
        rows={6}
        maxLength={10000}
        defaultValue={values.description}
        error={error("description")}
        required
      />
      {KIND_FIELDS[kind].map(field)}
      {tasks.length ? (
        <SelectField
          id="feedback-task"
          name="task"
          label={t("feedback.fields.task")}
          defaultValue={values.task ?? ""}
          error={error("task")}
          options={[{ value: "", label: t("feedback.fields.noTask") }, ...tasks.map((task) => ({ value: task.id, label: task.title }))]}
        />
      ) : null}
      <div>
        <Button type="submit" variant="primary" icon={PaperPlaneTiltIcon}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
