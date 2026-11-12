import type { ReactNode } from "react";

import { CheckCircleIcon, InfoIcon, WarningIcon, type IconComponent } from "./icons";
import styles from "./Notice.module.css";

type Tone = "info" | "ok" | "danger";

const ICONS: Record<Tone, IconComponent> = { info: InfoIcon, ok: CheckCircleIcon, danger: WarningIcon };

/**
 * Inline message above a form or page content. Errors use role="alert" (announced at once),
 * everything else role="status". Always icon + text, never colour alone.
 */
export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`${styles.notice} ${styles[tone]}`}>
      <Icon aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
    </div>
  );
}
