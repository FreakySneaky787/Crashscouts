import { useId, type ReactNode } from "react";

import styles from "./Panel.module.css";

/**
 * A bordered section with a title. `flush` removes the body padding for lists and tables.
 * Panel titles are larger than body text (type scale: --text-panel).
 */
export function Panel({
  title,
  aside,
  children,
  flush = false,
  headingLevel = 2,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  headingLevel?: 2 | 3;
}) {
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <header className={styles.header}>
        <Heading id={id} className={styles.title}>
          {title}
        </Heading>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </header>
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </section>
  );
}
