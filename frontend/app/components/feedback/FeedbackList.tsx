/**
 * A list of feedback (WP 5.3): title as a link, kind, status (icon and text), whether it is the
 * viewer's own and whether it is public. Never shows who wrote it.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { StatusPill } from "~/components/ui/StatusPill";
import { FEEDBACK_STATUS } from "~/components/ui/statuses";
import { feedbackStatusStyleKey, type Feedback } from "~/lib/feedback";

import styles from "./Feedback.module.css";

export function FeedbackList({ items, base }: { items: Pick<Feedback, "id" | "title" | "kind" | "status" | "is_mine" | "published">[]; base: string }) {
  const { t } = useTranslation();
  if (!items.length) return <p className={styles.muted}>{t("feedback.none")}</p>;
  return (
    <ul className={styles.files} aria-label={t("feedback.title")}>
      {items.map((item) => {
        const style = FEEDBACK_STATUS[feedbackStatusStyleKey(item.status)];
        return (
          <li key={item.id} className={styles.row}>
            <span className={styles.stackTight}>
              <Link to={`${base}/feedback/${item.id}`}>{item.title}</Link>
              <span className={styles.muted}>
                {t(`feedback.kinds.${item.kind}`)}
                {item.is_mine ? ` · ${t("feedback.yours")}` : ""}
                {item.published ? ` · ${t("feedback.public")}` : ""}
              </span>
            </span>
            <StatusPill tone={style.tone} icon={"icon" in style ? style.icon : undefined} label={t(`feedback.statuses.${item.status}`)} />
          </li>
        );
      })}
    </ul>
  );
}
