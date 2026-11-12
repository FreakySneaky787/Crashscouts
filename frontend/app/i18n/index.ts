import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const defaultLanguage = "en";
export const defaultNamespace = "translation";
export const resources = { en: { translation: en } } as const;

/**
 * Erzeugt für jeden Render-Baum eine EIGENE i18next-Instanz. Im SSR-Server bedeutet das: eine
 * Instanz pro Anfrage, kein zwischen Nutzern geteilter Zustand (docs/SECURITY.md §8).
 */
export function createI18n(language: string = defaultLanguage): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: defaultLanguage,
    defaultNS: defaultNamespace,
    resources,
    initAsync: false,
    // React escapt selbst; doppeltes Escaping würde Texte verfälschen.
    interpolation: { escapeValue: false },
  });
  return instance;
}
