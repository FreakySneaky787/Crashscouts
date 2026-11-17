/**
 * Small line illustrations for the home page and empty states (owner's decision 2026-11-17,
 * WP 8.9, ADR 0035). Drawn for Crashscouts, no stock art. Lines use the secondary text colour,
 * highlights the accent, so they follow both themes. Always decorative (`aria-hidden`).
 */
import styles from "./Illustrations.module.css";

type Props = { className?: string };

function Frame({ className, viewBox, children }: Props & { viewBox: string; children: React.ReactNode }) {
  return (
    <svg className={[styles.art, className].filter(Boolean).join(" ")} viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** A browser window with a crash line; a scout's trail of dots leads to the fault, marked found. */
export function HeroIllustration({ className }: Props) {
  return (
    <Frame className={className} viewBox="0 0 320 220">
      <rect className={styles.surface} x="20" y="24" width="250" height="168" rx="12" />
      <rect className={styles.line} x="20" y="24" width="250" height="168" rx="12" />
      <path className={styles.line} d="M20 52H270" />
      <circle className={styles.fill} cx="38" cy="38" r="4" />
      <circle className={styles.fill} cx="52" cy="38" r="4" />
      <circle className={styles.fill} cx="66" cy="38" r="4" />
      <path className={styles.soft} d="M44 78H150M44 96H200M44 114H120" />
      <path className={styles.crash} d="M44 158L84 158L98 132L116 176L132 146L150 158L200 158" />
      <circle className={styles.trail} cx="300" cy="204" r="4" />
      <circle className={styles.trail} cx="304" cy="182" r="4" />
      <circle className={styles.trail} cx="300" cy="160" r="4" />
      <circle className={styles.found} cx="292" cy="132" r="18" />
      <path className={styles.check} d="M284 132L290 138L301 126" />
      <path className={styles.pointer} d="M276 120L132 146" />
    </Frame>
  );
}

/** Step 1: a campaign with tasks. */
export function CampaignArt({ className }: Props) {
  return (
    <Frame className={className} viewBox="0 0 96 72">
      <rect className={styles.surface} x="22" y="8" width="52" height="58" rx="6" />
      <rect className={styles.line} x="22" y="8" width="52" height="58" rx="6" />
      <path className={styles.lineAccent} d="M30 24L34 28L41 20" />
      <path className={styles.lineAccent} d="M30 38L34 42L41 34" />
      <rect className={styles.line} x="30" y="48" width="10" height="10" rx="2" />
      <path className={styles.soft} d="M47 24H66M47 38H62M47 53H64" />
    </Frame>
  );
}

/** Step 2: testers join. */
export function TestersArt({ className }: Props) {
  return (
    <Frame className={className} viewBox="0 0 96 72">
      <circle className={styles.line} cx="28" cy="28" r="8" />
      <path className={styles.line} d="M14 58C14 48 20 42 28 42C36 42 42 48 42 58" />
      <circle className={styles.lineAccent} cx="48" cy="24" r="9" />
      <path className={styles.lineAccent} d="M33 58C33 46 40 39 48 39C56 39 63 46 63 58" />
      <circle className={styles.line} cx="68" cy="28" r="8" />
      <path className={styles.line} d="M54 58C54 48 60 42 68 42C76 42 82 48 82 58" />
    </Frame>
  );
}

/** Step 3: structured feedback arrives. */
export function FeedbackArt({ className }: Props) {
  return (
    <Frame className={className} viewBox="0 0 96 72">
      <path className={styles.surface} d="M14 34L24 14H72L82 34V60H14Z" />
      <path className={styles.line} d="M14 34L24 14H72L82 34V60H14Z" />
      <path className={styles.line} d="M14 34H34L38 42H58L62 34H82" />
      <rect className={styles.fillAccent} x="40" y="20" width="16" height="14" rx="3" />
      <path className={styles.soft} d="M30 50H66" />
    </Frame>
  );
}
