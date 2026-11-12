import type { ReactNode } from "react";

import { InfoIcon, WarningIcon, type IconComponent } from "./icons";
import styles from "./EmptyState.module.css";

/**
 * Empty states distinguish three cases (after Primer's guidance):
 * - "first-use": the feature has not been used yet – explain its purpose and offer one action;
 * - "empty": temporarily nothing to show;
 * - "error": something went wrong – say what and how to fix it; never playful.
 */
export function EmptyState({
  kind,
  title,
  children,
  action,
  icon,
}: {
  kind: "first-use" | "empty" | "error";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconComponent;
}) {
  const Icon = icon ?? (kind === "error" ? WarningIcon : InfoIcon);
  return (
    <div className={`${styles.empty} ${kind === "error" ? styles.error : ""}`} role={kind === "error" ? "alert" : undefined}>
      <Icon aria-hidden="true" className={styles.icon} />
      <p className={styles.title}>{title}</p>
      {children ? <p className={styles.text}>{children}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
