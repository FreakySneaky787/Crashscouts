import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

import type { IconComponent } from "./icons";
import styles from "./Button.module.css";

/** "danger" only for irreversible actions such as deleting the account. */
type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "md" | "sm";

type Common = { variant?: Variant; size?: Size; icon?: IconComponent; children?: ReactNode };

function classes(variant: Variant, size: Size, extra?: string) {
  return [styles.button, styles[variant], size === "sm" ? styles.sm : "", extra ?? ""].filter(Boolean).join(" ");
}

/** Button for actions. Use `ButtonLink` for navigation. */
export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  children,
  className,
  type = "button",
  ...rest
}: Common & ComponentPropsWithoutRef<"button">) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest}>
      {Icon ? <Icon aria-hidden="true" className={styles.icon} /> : null}
      {children}
    </button>
  );
}

/** Link styled as a button (navigation, not actions). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon: Icon,
  children,
  className,
  ...rest
}: Common & LinkProps) {
  return (
    <Link className={classes(variant, size, className)} {...rest}>
      {Icon ? <Icon aria-hidden="true" className={styles.icon} /> : null}
      {children}
    </Link>
  );
}
