import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";

import { brand } from "~/config/brand";
import type { Theme } from "~/lib/theme";
import { Avatar } from "~/components/ui/Data";
import { Notice } from "~/components/ui/Notice";
import { ThemeToggle } from "~/components/ui/ThemeToggle";
import { CompassIcon, HouseIcon, ListIcon, PaletteIcon, SignInIcon, UserCircleIcon, UserPlusIcon, type IconComponent } from "~/components/ui/icons";

import styles from "./AppShell.module.css";

/** `suspended`: the account is read only (WP 7.2); a notice links to the explanation. */
export type ShellUser = { username: string; suspended?: boolean } | null;

type NavItem = { to: string; label: string; icon: IconComponent; end?: boolean };

function NavList({ items }: { items: NavItem[] }) {
  return (
    <ul className={styles.navList}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} className={styles.navLink}>
            <Icon aria-hidden="true" className={styles.navIcon} />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Application frame of the "Developer Workbench" direction: dimmed sidebar navigation, sticky top
 * bar and the main content area. On narrow screens the navigation moves into a <details> menu,
 * which works without JavaScript.
 */
export function AppShell({ user, theme, children }: { user: ShellUser; theme: Theme; children: ReactNode }) {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { to: "/", label: t("nav.home"), icon: HouseIcon, end: true },
    { to: "/discover", label: t("nav.discover"), icon: CompassIcon },
    ...(user
      ? [{ to: "/account", label: t("nav.account"), icon: UserCircleIcon }]
      : [
          { to: "/login", label: t("nav.login"), icon: SignInIcon },
          { to: "/signup", label: t("nav.signup"), icon: UserPlusIcon },
        ]),
  ];
  const secondary: NavItem[] = [{ to: "/design-system", label: t("nav.designSystem"), icon: PaletteIcon }];

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        {t("shell.skip")}
      </a>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            {brand.name.slice(0, 1)}
          </span>
          {brand.name}
        </div>
        <nav aria-label={t("shell.mainNav")}>
          <NavList items={items} />
        </nav>
        <nav aria-label={t("shell.resourcesNav")} className={styles.secondary}>
          <NavList items={secondary} />
        </nav>
      </aside>
      <div className={styles.column}>
        <header className={styles.topbar}>
          <details className={styles.menu}>
            <summary className={styles.menuButton}>
              <ListIcon aria-hidden="true" className={styles.navIcon} />
              <span className="visually-hidden">{t("shell.menu")}</span>
            </summary>
            <nav aria-label={t("shell.mainNav")} className={styles.menuPanel}>
              <NavList items={[...items, ...secondary]} />
            </nav>
          </details>
          <span className={styles.mobileBrand}>{brand.name}</span>
          <span className={styles.spacer} />
          <ThemeToggle current={theme} />
          {user ? (
            <NavLink to="/account" className={styles.me}>
              <Avatar name={user.username} id={user.username} />
              <span className="visually-hidden">{t("shell.signedInAs", { username: user.username })}</span>
            </NavLink>
          ) : null}
        </header>
        <main id="main" tabIndex={-1} className={styles.main}>
          {user?.suspended ? (
            <Notice tone="info" title={t("suspension.banner")}>
              <NavLink to="/account#suspension">{t("suspension.bannerLink")}</NavLink>
            </Notice>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
