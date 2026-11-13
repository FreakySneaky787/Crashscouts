/**
 * Applying to a campaign with approval (WP 3A.4b): the form with the campaign's questions, or
 * the status of one's own application with "Withdraw". Plain forms, works without JavaScript.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button, ButtonLink } from "~/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import { PaperPlaneTiltIcon, SignInIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { canApply, type ApplicationQuestion, type Campaign } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

export function ApplicationPanel({
  campaign,
  questions,
  signedIn,
  csrfToken,
  loginTo,
  values,
}: {
  campaign: Campaign;
  questions: ApplicationQuestion[];
  signedIn: boolean;
  csrfToken: string | null;
  loginTo: string;
  values: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken ?? ""} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  if (campaign.my_application === "pending") {
    return (
      <Panel title={t("campaigns.apply.title")}>
        <Form method="post" className={styles.fields}>
          <Notice tone="info" title={t("campaigns.apply.pending")} />
          {hidden("withdraw")}
          <div>
            <Button type="submit" variant="secondary" icon={XIcon}>
              {t("campaigns.apply.withdraw")}
            </Button>
          </div>
        </Form>
      </Panel>
    );
  }
  if (campaign.my_application === "rejected") {
    return (
      <Panel title={t("campaigns.apply.title")}>
        <Notice tone="info" title={t("campaigns.apply.rejected")} />
      </Panel>
    );
  }
  if (!canApply(campaign)) return null;
  return (
    <Panel title={t("campaigns.apply.title")}>
      <div className={styles.fields}>
        <p className={styles.radioHint}>{t("campaigns.apply.intro")}</p>
        {!signedIn ? (
          <div>
            <ButtonLink to={loginTo} variant="primary" icon={SignInIcon}>
              {t("campaigns.join.signIn")}
            </ButtonLink>
          </div>
        ) : (
          <Form method="post" className={styles.fields} noValidate>
            {hidden("apply")}
            {questions.map((q) => {
              const id = `answer-${q.id}`;
              const name = `answer:${q.id}`;
              const label = q.required ? q.prompt : t("campaigns.apply.optional", { prompt: q.prompt });
              const value = values?.[q.id] ?? "";
              if (q.kind === "long_text") return <TextAreaField key={q.id} id={id} name={name} label={label} rows={4} maxLength={2000} defaultValue={value} required={q.required} />;
              if (q.kind === "single_choice" || q.kind === "yes_no") {
                const options = q.kind === "yes_no" ? [{ value: "yes", label: t("campaigns.apply.yes") }, { value: "no", label: t("campaigns.apply.no") }] : q.options.map((o) => ({ value: o, label: o }));
                return <SelectField key={q.id} id={id} name={name} label={label} defaultValue={value} options={[{ value: "", label: t("campaigns.apply.choose") }, ...options]} required={q.required} />;
              }
              return <TextField key={q.id} id={id} name={name} label={label} maxLength={200} defaultValue={value} required={q.required} />;
            })}
            <p className={styles.radioHint}>{t("campaigns.apply.privacy")}</p>
            <div>
              <Button type="submit" variant="primary" icon={PaperPlaneTiltIcon}>
                {t("campaigns.apply.send")}
              </Button>
            </div>
          </Form>
        )}
      </div>
    </Panel>
  );
}
