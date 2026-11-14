/**
 * The suspended person's own view (WP 7.2, ADR 0027): reason, message, end, what still works, and
 * the single appeal while none was made yet. Plain form, works without JavaScript.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { TextAreaField } from "~/components/ui/Form";
import { PaperPlaneTiltIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { formatInZone } from "~/lib/campaigns";
import type { SuspensionInfo } from "~/lib/moderation";

import styles from "~/routes/forms.module.css";

export function SuspensionNotice({ info, csrfToken }: { info: SuspensionInfo; csrfToken: string }) {
  const { t } = useTranslation();
  return (
    <div id="suspension">
      <Panel title={t("suspension.title")}>
        <div className={styles.stack}>
          <Notice tone="danger" title={t("suspension.reason", { reason: t(`reports.reasons.${info.category}`) })}>
            {info.message}
          </Notice>
          <p>{info.ends_at ? t("suspension.until", { end: `${formatInZone(info.ends_at, "UTC")} UTC` }) : t("suspension.permanent")}</p>
          <p className={styles.muted}>{t("suspension.effect")}</p>
          {info.appeal === "none" ? (
            <Form method="post" action="/suspension/appeal" className={styles.form}>
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <TextAreaField id="suspension-appeal" name="text" label={t("suspension.appeal")} hint={t("suspension.appealHint")} rows={4} maxLength={1000} required />
              <div>
                <Button type="submit" icon={PaperPlaneTiltIcon}>
                  {t("suspension.send")}
                </Button>
              </div>
            </Form>
          ) : (
            <p>{t(`suspension.appealState.${info.appeal}`)}</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
