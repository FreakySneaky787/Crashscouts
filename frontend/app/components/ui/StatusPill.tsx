import type { IconComponent } from "./icons";
import type { Tone } from "./statuses";
import styles from "./StatusPill.module.css";

/** Status label: semantic tone + optional icon + always the text label (never colour alone). */
export function StatusPill({ tone, icon: Icon, label }: { tone: Tone; icon?: IconComponent; label: string }) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      {Icon ? <Icon aria-hidden="true" className={styles.icon} /> : null}
      {label}
    </span>
  );
}
