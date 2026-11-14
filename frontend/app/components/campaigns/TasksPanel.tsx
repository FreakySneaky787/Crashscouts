/**
 * Test tasks on the campaign's edit page (WP 4.2, ADR 0023): list, edit, reorder, remove, add.
 * Plain forms that work without JavaScript. Tasks stay editable after publishing; a task with
 * reported progress is hidden instead of deleted (the page says so after removing).
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { TextAreaField, TextField } from "~/components/ui/Form";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { MAX_TASKS, type TestMethod, type TestTask } from "~/lib/campaigns";

import styles from "./CampaignForm.module.css";

export type TaskDone = "added" | "saved" | "removed" | "hidden";

export function TasksPanel({
  method,
  tasks,
  csrfToken,
  editable,
  errors,
  values,
  done,
}: {
  method: TestMethod;
  tasks: TestTask[];
  csrfToken: string;
  /** False for completed and cancelled campaigns. */
  editable: boolean;
  errors: Record<string, string>;
  values: { title?: string; instructions?: string; expected_result?: string } | null;
  done: TaskDone | null;
}) {
  const { t } = useTranslation();
  const hidden = (intent: string, task?: string) => (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
      {task ? <input type="hidden" name="task" value={task} /> : null}
    </>
  );
  const fieldError = (field: string) => (errors[field] ? t(`campaigns.tasks.errors.${field as "title"}`, { defaultValue: t("formError.other") }) : undefined);

  if (method === "free") {
    return (
      <Panel title={t("campaigns.tasks.title")}>
        <p className={styles.radioHint}>{t("campaigns.tasks.freeIntro")}</p>
      </Panel>
    );
  }
  return (
    <Panel title={t("campaigns.tasks.title")}>
      <div className={styles.fields}>
        <p className={styles.radioHint}>{t("campaigns.tasks.intro")}</p>
        {done ? <Notice tone={done === "hidden" ? "info" : "ok"} title={t(`campaigns.tasks.done.${done}`)} /> : null}
        {errors.code ? <Notice tone="danger" title={t(`campaigns.problem.${errors.code as "last_task"}`, { defaultValue: t("campaigns.problem.generic") })} /> : null}
        {tasks.length ? (
          <ol className={styles.taskList} aria-label={t("campaigns.tasks.title")}>
            {tasks.map((task, index) => (
              <li key={task.id} className={styles.taskItem}>
                <div className={styles.questionRow}>
                  <strong>{task.title}</strong>
                  {editable ? (
                    <span className={styles.trail}>
                      <Form method="post">
                        {hidden("task-move", task.id)}
                        <input type="hidden" name="direction" value="up" />
                        <Button type="submit" variant="quiet" size="sm" icon={ArrowUpIcon} disabled={index === 0} aria-label={t("campaigns.tasks.moveUpNamed", { title: task.title })}>
                          {t("campaigns.tasks.moveUp")}
                        </Button>
                      </Form>
                      <Form method="post">
                        {hidden("task-move", task.id)}
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="quiet"
                          size="sm"
                          icon={ArrowDownIcon}
                          disabled={index === tasks.length - 1}
                          aria-label={t("campaigns.tasks.moveDownNamed", { title: task.title })}
                        >
                          {t("campaigns.tasks.moveDown")}
                        </Button>
                      </Form>
                      <Form method="post">
                        {hidden("task-remove", task.id)}
                        <Button type="submit" variant="quiet" size="sm" icon={XIcon} aria-label={t("campaigns.tasks.removeNamed", { title: task.title })}>
                          {t("campaigns.tasks.remove")}
                        </Button>
                      </Form>
                    </span>
                  ) : null}
                </div>
                {editable ? (
                  <details className={styles.taskEdit}>
                    <summary aria-label={t("campaigns.tasks.editNamed", { title: task.title })}>{t("campaigns.tasks.edit")}</summary>
                    <Form method="post" className={styles.fields} noValidate>
                      {hidden("task-change", task.id)}
                      <TextField id={`task-title-${task.id}`} name="title" label={t("campaigns.tasks.taskTitle")} maxLength={120} defaultValue={task.title} required />
                      <TextAreaField id={`task-instructions-${task.id}`} name="instructions" label={t("campaigns.tasks.instructions")} hint={t("campaigns.markdownHint")} rows={4} maxLength={4000} defaultValue={task.instructions} />
                      <TextAreaField id={`task-expected-${task.id}`} name="expected_result" label={t("campaigns.tasks.expected")} hint={t("campaigns.tasks.expectedHint")} rows={2} maxLength={1000} defaultValue={task.expected_result} />
                      <div>
                        <Button type="submit" variant="secondary" size="sm" icon={CheckIcon}>
                          {t("campaigns.tasks.save")}
                        </Button>
                      </div>
                    </Form>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.radioHint}>{t("campaigns.tasks.noneRequired")}</p>
        )}
        {editable && tasks.length < MAX_TASKS ? (
          <Form method="post" className={styles.fields} noValidate>
            <h3 className={styles.radioLabel}>{t("campaigns.tasks.add")}</h3>
            {hidden("task-add")}
            <TextField id="task-title" name="title" label={t("campaigns.tasks.taskTitle")} hint={t("campaigns.tasks.taskTitleHint")} maxLength={120} defaultValue={values?.title} error={fieldError("title")} required />
            <TextAreaField
              id="task-instructions"
              name="instructions"
              label={t("campaigns.tasks.instructions")}
              hint={t("campaigns.markdownHint")}
              rows={4}
              maxLength={4000}
              defaultValue={values?.instructions}
              error={fieldError("instructions")}
            />
            <TextAreaField
              id="task-expected"
              name="expected_result"
              label={t("campaigns.tasks.expected")}
              hint={t("campaigns.tasks.expectedHint")}
              rows={2}
              maxLength={1000}
              defaultValue={values?.expected_result}
              error={fieldError("expected_result")}
            />
            <div>
              <Button type="submit" icon={PlusIcon}>
                {t("campaigns.tasks.addButton")}
              </Button>
            </div>
          </Form>
        ) : null}
      </div>
    </Panel>
  );
}
