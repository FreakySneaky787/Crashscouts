/**
 * Application questions on the edit page (WP 3A.4b): only for campaigns that take applications.
 * Editable while the campaign is a draft (applicants answer what was published). Plain forms.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { CheckboxField, SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { PlusIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { QUESTION_KINDS, QUESTION_TEMPLATES, type ApplicationQuestion } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

const MAX_QUESTIONS = 10;

export function QuestionsPanel({
  questions,
  csrfToken,
  editable,
  errors,
}: {
  questions: ApplicationQuestion[];
  csrfToken: string;
  editable: boolean;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const fieldError = (field: string) => (errors[field] ? t(`campaigns.questions.errors.${field as "prompt"}`, { defaultValue: t("formError.other") }) : undefined);
  const canAdd = editable && questions.length < MAX_QUESTIONS;
  return (
    <Panel title={t("campaigns.questions.title")}>
      <div className={styles.fields}>
        <p className={styles.radioHint}>{t(editable ? "campaigns.questions.intro" : "campaigns.questions.locked")}</p>
        {questions.length ? (
          <ol className={styles.fields} aria-label={t("campaigns.questions.title")}>
            {questions.map((q) => (
              <li key={q.id} className={styles.questionRow}>
                <span>
                  <strong>{q.prompt}</strong>
                  <span className={styles.radioHint}>
                    {" "}
                    · {t(`campaigns.questions.kinds.${q.kind}`)}
                    {q.required ? ` · ${t("campaigns.questions.required")}` : ""}
                    {q.options.length ? ` · ${q.options.join(" / ")}` : ""}
                  </span>
                </span>
                {editable ? (
                  <Form method="post">
                    {hidden("question-remove")}
                    <input type="hidden" name="question" value={q.id} />
                    <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("campaigns.questions.removeNamed", { prompt: q.prompt })}>
                      {t("campaigns.questions.remove")}
                    </Button>
                  </Form>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.radioHint}>{t("campaigns.questions.none")}</p>
        )}
        {canAdd ? (
          <>
            <div className={styles.trail} role="group" aria-label={t("campaigns.questions.templates")}>
              {QUESTION_TEMPLATES.map((key) => (
                <Form method="post" key={key}>
                  {hidden("question-template")}
                  <input type="hidden" name="template" value={key} />
                  <Button type="submit" variant="secondary" size="sm" icon={PlusIcon}>
                    {t(`campaigns.questions.templateNames.${key}`)}
                  </Button>
                </Form>
              ))}
            </div>
            <Form method="post" className={styles.fields} noValidate>
              <h3 className={styles.radioLabel}>{t("campaigns.questions.custom")}</h3>
              {hidden("question-add")}
              <TextField id="question-prompt" name="prompt" label={t("campaigns.questions.prompt")} maxLength={200} error={fieldError("prompt")} required />
              <SelectField
                id="question-kind"
                name="kind"
                label={t("campaigns.questions.kind")}
                options={QUESTION_KINDS.map((k) => ({ value: k, label: t(`campaigns.questions.kinds.${k}`) }))}
              />
              <TextAreaField id="question-options" name="options" label={t("campaigns.questions.options")} hint={t("campaigns.questions.optionsHint")} rows={3} error={fieldError("options")} />
              <CheckboxField id="question-required" name="required" label={t("campaigns.questions.requiredLabel")} />
              <div>
                <Button type="submit" icon={PlusIcon}>
                  {t("campaigns.questions.add")}
                </Button>
              </div>
            </Form>
          </>
        ) : null}
        {errors.code ? <Notice tone="danger" title={t(`campaigns.problem.${errors.code as "questions_locked"}`)} /> : null}
      </div>
    </Panel>
  );
}
