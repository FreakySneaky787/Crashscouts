import type { ReactNode } from "react";

import { hueIndex, initials } from "./identity";
import type { IconComponent } from "./icons";
import styles from "./Data.module.css";

/** Large key figures, e.g. "18 / 40 testers". */
export function KeyFigures({ items }: { items: { value: ReactNode; of?: ReactNode; label: string }[] }) {
  return (
    <dl className={styles.figures}>
      {items.map((item) => (
        <div key={item.label} className={styles.figure}>
          <dt className={styles.figureLabel}>{item.label}</dt>
          <dd className={styles.figureValue}>
            {item.value}
            {item.of != null ? <span className={styles.figureOf}>/ {item.of}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Native progress bar (no inline styles), labelled for assistive technology. */
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return <progress className={styles.progress} value={value} max={max} aria-label={label} />;
}

/** Person avatar with initials and a stable identity hue. */
export function Avatar({ name, id, size = "md" }: { name: string; id: string; size?: "md" | "lg" }) {
  return (
    <span className={`${styles.avatar} ${styles[`hue${hueIndex(id)}`]} ${size === "lg" ? styles.lg : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Project icon: square, two letters, identity hue. Distinct from round person avatars. */
export function ProjectIcon({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`${styles.picon} ${styles[`hue${hueIndex(id)}`]} ${styles[size]}`} aria-hidden="true">
      {Array.from(name).slice(0, 2).join("")}
    </span>
  );
}

/** Small chips for tags such as platforms or skills. */
export function Chips({ items, label }: { items: string[]; label?: string }) {
  return (
    <ul className={styles.chips} aria-label={label}>
      {items.map((item) => (
        <li key={item} className={styles.chip}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Label/value list for facts such as license, platforms, languages. */
export function FactList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.facts}>
      {items.map((item) => (
        <div key={item.label} className={styles.fact}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type Row = {
  key: string;
  icon?: IconComponent;
  leading?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
};

/** Dense row list with three text levels: primary, secondary, meta (trailing). */
export function RowList({ rows, label }: { rows: Row[]; label?: string }) {
  return (
    <ul className={styles.rows} aria-label={label}>
      {rows.map(({ key, icon: Icon, leading, primary, secondary, trailing }) => (
        <li key={key} className={styles.row}>
          <span className={styles.rowLead}>{leading ?? (Icon ? <Icon aria-hidden="true" className={styles.rowIcon} /> : null)}</span>
          <span className={styles.rowText}>
            <span className={styles.rowPrimary}>{primary}</span>
            {secondary ? <span className={styles.rowSecondary}>{secondary}</span> : null}
          </span>
          {trailing ? <span className={styles.rowTrail}>{trailing}</span> : null}
        </li>
      ))}
    </ul>
  );
}
