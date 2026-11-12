import { Link } from "react-router";

import styles from "./TabNav.module.css";

export type TabItem = { key: string; label: string; to: string; count?: number };

/**
 * Section navigation rendered as links (works without JavaScript, bookmarkable, server-rendered).
 * The current section is marked with aria-current="page".
 */
export function TabNav({ label, items, current }: { label: string; items: TabItem[]; current: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              preventScrollReset
              className={styles.tab}
              aria-current={item.key === current ? "page" : undefined}
            >
              {item.label}
              {item.count != null ? <span className={`${styles.count} tabular`}>{item.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
