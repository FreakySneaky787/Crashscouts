import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLocation } from "react-router";

import { isTheme, type Theme } from "~/lib/theme";

import { MonitorIcon, MoonIcon, SunIcon } from "./icons";
import styles from "./ThemeToggle.module.css";

const OPTIONS = [
  { value: "system", icon: MonitorIcon },
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
] as const;

const noopSubscribe = () => () => {};
/** true after hydration, false during server rendering. */
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

/**
 * Theme switch (system / light / dark). A plain form posting to /theme, so it works without
 * JavaScript (full page reload); with JavaScript it updates in place via a fetcher.
 */
export function ThemeToggle({ current }: { current: Theme }) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const location = useLocation();
  const hydrated = useHydrated();
  const pending = fetcher.formData?.get("theme");
  const active = isTheme(pending) ? pending : current;

  return (
    <fetcher.Form method="post" action="/theme" className={styles.toggle} aria-label={t("theme.label")}>
      <input type="hidden" name="redirectTo" value={`${location.pathname}${location.search}`} />
      {hydrated ? <input type="hidden" name="_js" value="1" /> : null}
      {OPTIONS.map(({ value, icon: Icon }) => {
        const label = t(`theme.${value}`);
        return (
        <button
          key={value}
          type="submit"
          name="theme"
          value={value}
          aria-pressed={active === value}
          title={label}
          className={styles.option}
        >
          <Icon aria-hidden="true" className={styles.icon} />
          <span className="visually-hidden">{label}</span>
        </button>
        );
      })}
    </fetcher.Form>
  );
}
