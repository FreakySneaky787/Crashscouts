/**
 * The test tasks on the campaign page (WPs 4.2 and 4.3, ADR 0023). Everyone who sees the campaign
 * reads them in the team's order; instructions are Markdown with the same safe allowlist as the
 * description. Participants also see their own status and, while they can report, a plain form
 * per task (status and an optional note that only the team and they see).
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { SelectField, TextAreaField } from "~/components/ui/Form";
import { CheckIcon } from "~/components/ui/icons";
import { Markdown } from "~/components/ui/Markdown";
import { StatusPill } from "~/components/ui/StatusPill";
import { TASK_STATUS } from "~/components/ui/statuses";
import { TASK_STATUSES, taskStatusStyleKey, type TestTask } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

export function CampaignTaskList({
  tasks,
  showMine,
  canReport,
  csrfToken,
}: {
  tasks: TestTask[];
  /** The viewer takes or took part: show their own status (never anyone else's). */
  showMine: boolean;
  /** Active participant of a published campaign: show the status forms. */
  canReport: boolean;
  csrfToken: string | null;
}) {
  const { t } = useTranslation();
  if (!tasks.length) return <p className={styles.radioHint}>{t("campaigns.tasks.none")}</p>;
  return (
    <div className={styles.fields}>
      {showMine && !canReport ? <p className={styles.radioHint}>{t("campaigns.tasks.progress.readOnly")}</p> : null}
      <ol className={styles.taskList} aria-label={t("campaigns.tasks.title")}>
        {tasks.map((task) => {
          const style = TASK_STATUS[taskStatusStyleKey(task.my_status)];
          return (
            <li key={task.id} id={`task-${task.id}`} className={styles.taskItem}>
              <div className={styles.questionRow}>
                <h3 className={styles.taskTitle}>{task.title}</h3>
                {showMine ? <StatusPill tone={style.tone} icon={style.icon} label={t(`campaigns.tasks.progress.statuses.${task.my_status}`)} /> : null}
              </div>
              {task.instructions ? <Markdown>{task.instructions}</Markdown> : null}
              {task.expected_result ? (
                <p className={styles.radioHint}>
                  <strong>{t("campaigns.tasks.expectedLabel")}:</strong> {task.expected_result}
                </p>
              ) : null}
              {canReport ? (
                <Form method="post" className={styles.progressForm} noValidate>
                  <input type="hidden" name="csrf_token" value={csrfToken ?? ""} />
                  <input type="hidden" name="intent" value="task-progress" />
                  <input type="hidden" name="task" value={task.id} />
                  <SelectField
                    id={`status-${task.id}`}
                    name="status"
                    label={t("campaigns.tasks.progress.status")}
                    defaultValue={task.my_status}
                    options={TASK_STATUSES.map((s) => ({ value: s, label: t(`campaigns.tasks.progress.statuses.${s}`) }))}
                  />
                  <TextAreaField
                    id={`note-${task.id}`}
                    name="note"
                    label={t("campaigns.tasks.progress.note")}
                    hint={t("campaigns.tasks.progress.noteHint")}
                    rows={2}
                    maxLength={1000}
                    defaultValue={task.my_note}
                  />
                  <div>
                    <Button type="submit" variant="secondary" size="sm" icon={CheckIcon} aria-label={t("campaigns.tasks.progress.saveNamed", { title: task.title })}>
                      {t("campaigns.tasks.progress.save")}
                    </Button>
                  </div>
                </Form>
              ) : showMine && task.my_note ? (
                <p className={styles.radioHint}>
                  <strong>{t("campaigns.tasks.progress.yourNote")}:</strong> {task.my_note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
