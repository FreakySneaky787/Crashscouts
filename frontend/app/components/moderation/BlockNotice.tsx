/**
 * Shown to the team of blocked content (WP 3B.3; owner's decision: the team sees the reason), and
 * to the author of hidden feedback (WP 7.1). Offers the team the single appeal while none was made
 * yet. Plain form, works without JavaScript.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { TextAreaField } from "~/components/ui/Form";
import { PaperPlaneTiltIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import type { ModerationInfo } from "~/lib/moderation";

import styles from "~/routes/forms.module.css";

type Props = {
  info: ModerationInfo;
  csrfToken: string | null;
  back: string;
  /** Hidden feedback: other wording; only the team may appeal. */
  feedback?: boolean;
  canAppeal?: boolean;
};

export function BlockNotice({ info, csrfToken, back, feedback = false, canAppeal = true }: Props) {
  const { t } = useTranslation();
  return (
    <Panel title={t(feedback ? "moderation.team.hiddenTitle" : "moderation.team.title")}>
      <div className={styles.stack}>
        <Notice tone="danger" title={t(feedback ? "moderation.team.hidden" : "moderation.team.blocked", { reason: t(`reports.reasons.${info.category}`) })}>
          {info.message}
        </Notice>
        <p className={styles.muted}>{t(feedback ? "moderation.team.effectFeedback" : "moderation.team.effect")}</p>
        {!canAppeal ? (
          info.appeal === "none" ? (
            <p>{t("moderation.team.teamMayAppeal")}</p>
          ) : (
            <p>{t(`moderation.team.appealStateAuthor.${info.appeal}`)}</p>
          )
        ) : info.appeal === "none" && csrfToken ? (
          <Form method="post" action={`/blocks/${info.block}/appeal`} className={styles.form}>
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <input type="hidden" name="back" value={back} />
            <TextAreaField id="appeal-text" name="text" label={t("moderation.team.appeal")} hint={t("moderation.team.appealHint")} rows={4} maxLength={1000} required />
            <div>
              <Button type="submit" icon={PaperPlaneTiltIcon}>
                {t("moderation.team.send")}
              </Button>
            </div>
          </Form>
        ) : (
          <p>{t(`moderation.team.appealState.${info.appeal === "none" ? "pending" : info.appeal}`)}</p>
        )}
      </div>
    </Panel>
  );
}
