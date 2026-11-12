import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const defaultLanguage = "en";
export const defaultNamespace = "translation";
export const resources = { en: { translation: en } } as const;

/**
 * Creates a SEPARATE i18next instance per render tree. In the SSR server this means one instance
 * per request – no state shared between users (docs/SECURITY.md §8).
 */
export function createI18n(language: string = defaultLanguage): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: defaultLanguage,
    defaultNS: defaultNamespace,
    resources,
    initAsync: false,
    // React escapes on its own; double escaping would corrupt texts.
    interpolation: { escapeValue: false },
  });
  return instance;
}
