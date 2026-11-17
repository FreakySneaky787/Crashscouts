import styles from "./Logo.module.css";

/**
 * The Crashscouts mark (owner's decision 2026-11-17, design "G1", ADR 0035): a C broken on the
 * left, both halves on one circle (r = 15, centre 24/24), the ends at ±40° flush, and a dot in the
 * opening. Ink follows the text colour, the dot is the accent colour, so it works in both themes.
 * Decorative next to the brand name; give `title` when it stands alone.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={[styles.mark, className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
        <path d="M35.49 14.36A15 15 0 0 0 9.33 20.88" />
        <path d="M9.33 27.12A15 15 0 0 0 35.49 33.64" />
      </g>
      <circle className={styles.dot} cx="38.2" cy="24" r="3.5" />
    </svg>
  );
}
