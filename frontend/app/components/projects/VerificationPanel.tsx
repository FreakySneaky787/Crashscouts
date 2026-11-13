/**
 * Repository verification on the project's edit page (WP 2.5). Plain forms: works without
 * JavaScript. Way A: check file in the repository root. Way B (GitHub only): one-time
 * authorization; the token is revoked by the server right after the check.
 */
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { ArrowsClockwiseIcon, GithubLogoIcon, ShieldCheckIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import styles from "~/routes/forms.module.css";
import { HOST_NAMES, type VerificationError, type VerificationStatus } from "~/lib/verification";

export function VerificationPanel({
  status,
  csrfToken,
  outcome,
}: {
  status: VerificationStatus;
  csrfToken: string;
  outcome: { ok: true } | { ok: false; error: VerificationError } | null;
}) {
  const { t } = useTranslation();
  const host = status.host ? HOST_NAMES[status.host] : null;
  return (
    <Panel
      title={t("verification.title")}
      aside={
        status.verified ? (
          <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("verification.verified")} />
        ) : (
          <StatusPill tone="neutral" label={t("verification.notVerified")} />
        )
      }
    >
      <div className={styles.stack}>
        {outcome?.ok ? <Notice tone="ok" title={t("verification.done")} /> : null}
        {outcome && !outcome.ok ? <Notice tone="danger" title={t(`verification.errors.${outcome.error}`)} /> : null}
        <p className={styles.muted}>{t("verification.intro")}</p>
        {status.verified ? (
          <p>{t(status.method === "github" ? "verification.verifiedByGitHub" : "verification.verifiedByFile", { host })}</p>
        ) : !host || !status.code ? (
          <p>{t("verification.unsupported")}</p>
        ) : (
          <>
            <div className={styles.stackTight}>
              <h3 className={styles.subhead}>{t("verification.fileTitle")}</h3>
              <ol className={styles.steps}>
                <li>
                  {t("verification.fileStep1", { host })}{" "}
                  <code className={styles.secret} data-testid="verification-filename">
                    {status.filename}
                  </code>
                </li>
                <li>
                  {t("verification.fileStep2")}{" "}
                  <code className={styles.secret} data-testid="verification-code">
                    {status.code}
                  </code>
                </li>
                <li>{t("verification.fileStep3")}</li>
              </ol>
              <Form method="post">
                <input type="hidden" name="csrf_token" value={csrfToken} />
                <input type="hidden" name="intent" value="verify-file" />
                <Button type="submit" icon={ArrowsClockwiseIcon}>
                  {t("verification.check")}
                </Button>
              </Form>
            </div>
            {status.github_available ? (
              <div className={styles.stackTight}>
                <h3 className={styles.subhead}>{t("verification.githubTitle")}</h3>
                <p className={styles.muted}>{t("verification.githubText")}</p>
                <Form method="post">
                  <input type="hidden" name="csrf_token" value={csrfToken} />
                  <input type="hidden" name="intent" value="verify-github" />
                  <Button type="submit" variant="secondary" icon={GithubLogoIcon}>
                    {t("verification.githubButton")}
                  </Button>
                </Form>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
