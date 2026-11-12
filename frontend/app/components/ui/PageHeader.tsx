import type { ReactNode } from "react";
import { Link } from "react-router";

import { CaretRightIcon } from "./icons";
import styles from "./PageHeader.module.css";

export type Crumb = { label: string; to?: string };

/** Breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.crumbs}>
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 ? <CaretRightIcon aria-hidden="true" className={styles.sep} /> : null}
            {item.to && i < items.length - 1 ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Page title block: optional breadcrumbs and leading visual, the title (28px), an optional quiet
 * version label, a subtitle, a meta row and actions on the right.
 */
export function PageHeader({
  title,
  version,
  subtitle,
  meta,
  actions,
  leading,
  breadcrumbs,
}: {
  title: ReactNode;
  version?: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className={styles.wrap}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className={styles.head}>
        {leading}
        <div className={styles.text}>
          <h1 className={styles.title}>
            {title}
            {version ? <span className={styles.version}>{version}</span> : null}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  );
}
