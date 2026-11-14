/**
 * The test tasks on the campaign page (WP 4.2, ADR 0023): everyone who sees the campaign reads
 * them, in the team's order. Instructions are Markdown, rendered with the same safe allowlist as
 * the description.
 */
import { useTranslation } from "react-i18next";

import { Markdown } from "~/components/ui/Markdown";
import type { TestTask } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

export function CampaignTaskList({ tasks }: { tasks: TestTask[] }) {
  const { t } = useTranslation();
  if (!tasks.length) return <p className={styles.radioHint}>{t("campaigns.tasks.none")}</p>;
  return (
    <ol className={styles.taskList} aria-label={t("campaigns.tasks.title")}>
      {tasks.map((task) => (
        <li key={task.id} className={styles.taskItem}>
          <h3 className={styles.taskTitle}>{task.title}</h3>
          {task.instructions ? <Markdown>{task.instructions}</Markdown> : null}
          {task.expected_result ? (
            <p className={styles.radioHint}>
              <strong>{t("campaigns.tasks.expectedLabel")}:</strong> {task.expected_result}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
