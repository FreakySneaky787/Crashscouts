/**
 * The team's overview of everyone's task progress (WP 4.4, ADR 0023), on the testers page.
 * Per task: how many completed, blocked or are in progress. Per tester: the status of every task
 * with notes behind a disclosure. A table on wide screens (scrolling inside its own container),
 * a list per tester on narrow ones; only one of the two is ever displayed. Statuses always show
 * icon and text, never colour alone. People who left or were removed, and tasks removed from the
 * list after progress was reported, are marked.
 */
import { useTranslation } from "react-i18next";

import { StatusPill } from "~/components/ui/StatusPill";
import { Panel } from "~/components/ui/Panel";
import { TASK_STATUS } from "~/components/ui/statuses";
import { overviewCell, taskStatusStyleKey, type ProgressOverview } from "~/lib/campaigns";

import styles from "./ProgressOverviewPanel.module.css";

export function ProgressOverviewPanel({ overview }: { overview: ProgressOverview }) {
  const { t } = useTranslation();
  const { tasks, participants } = overview;
  const taskLabel = (task: ProgressOverview["tasks"][number]) => (task.hidden ? `${task.title} (${t("campaigns.testers.progress.hiddenTask")})` : task.title);
  const personMark = (p: ProgressOverview["participants"][number]) =>
    p.participation === "active" ? null : <span className={styles.mark}>{t(`campaigns.testers.progress.${p.participation}`)}</span>;
  const cell = (p: ProgressOverview["participants"][number], taskId: string) => {
    const { status, note } = overviewCell(p, taskId);
    const style = TASK_STATUS[taskStatusStyleKey(status)];
    return (
      <div className={styles.cell}>
        <StatusPill tone={style.tone} icon={style.icon} label={t(`campaigns.tasks.progress.statuses.${status}`)} />
        {note ? (
          <details className={styles.note}>
            <summary>{t("campaigns.testers.progress.note")}</summary>
            <p>{note}</p>
          </details>
        ) : null}
      </div>
    );
  };

  return (
    <Panel title={t("campaigns.testers.progress.title")}>
      <div className={styles.stack}>
        <p className={styles.muted}>{t("campaigns.testers.progress.intro")}</p>
        {!tasks.length ? (
          <p className={styles.muted}>{t("campaigns.testers.progress.noTasks")}</p>
        ) : (
          <>
            <section className={styles.stackTight} aria-labelledby="progress-per-task">
              <h3 id="progress-per-task" className={styles.subhead}>
                {t("campaigns.testers.progress.perTask")}
              </h3>
              <ul className={styles.list} aria-labelledby="progress-per-task">
                {tasks.map((task) => (
                  <li key={task.id} className={styles.row}>
                    <span>{taskLabel(task)}</span>
                    <span className={styles.muted}>{t("campaigns.testers.progress.counts", task)}</span>
                  </li>
                ))}
              </ul>
            </section>
            {!participants.length ? (
              <p className={styles.muted}>{t("campaigns.testers.progress.none")}</p>
            ) : (
              <>
                <div className={styles.tableWrap} role="region" aria-label={t("campaigns.testers.progress.caption")} tabIndex={0}>
                  <table className={styles.table}>
                    <caption className="visually-hidden">{t("campaigns.testers.progress.caption")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("campaigns.testers.progress.tester")}</th>
                        {tasks.map((task) => (
                          <th key={task.id} scope="col">
                            {taskLabel(task)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p) => (
                        <tr key={p.username}>
                          <th scope="row">
                            <span className={styles.person}>
                              {p.username}
                              {personMark(p)}
                            </span>
                          </th>
                          {tasks.map((task) => (
                            <td key={task.id}>{cell(p, task.id)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <section className={styles.byTester} aria-labelledby="progress-by-tester">
                  <h3 id="progress-by-tester" className={styles.subhead}>
                    {t("campaigns.testers.progress.byTester")}
                  </h3>
                  <ul className={styles.list} aria-labelledby="progress-by-tester">
                    {participants.map((p) => (
                      <li key={p.username} className={styles.stackTight}>
                        <strong className={styles.person}>
                          {p.username}
                          {personMark(p)}
                        </strong>
                        <dl className={styles.pairs}>
                          {tasks.map((task) => (
                            <div key={task.id}>
                              <dt>{taskLabel(task)}</dt>
                              <dd>{cell(p, task.id)}</dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
