import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import appEn from "./app.en.json" with { type: "json" };
import appRu from "./app.ru.json" with { type: "json" };
import domainEn from "./domain.en.json" with { type: "json" };
import domainRu from "./domain.ru.json" with { type: "json" };
import screensEn from "./screens.en.json" with { type: "json" };
import screensRu from "./screens.ru.json" with { type: "json" };

export const APP_LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];
const LANGUAGE_KEY = "gym-cycle-language";

function getInitialLanguage() {
  try {
    const storedLanguage = localStorage.getItem(LANGUAGE_KEY);
    if (APP_LANGUAGES.some(({ code }) => code === storedLanguage)) {
      return storedLanguage;
    }
  } catch {}
  return "ru";
}

export const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  resources: {
    ru: { app: appRu, domain: domainRu, screens: screensRu },
    en: { app: appEn, domain: domainEn, screens: screensEn },
  },
  lng: getInitialLanguage(),
  supportedLngs: APP_LANGUAGES.map(({ code }) => code),
  fallbackLng: "ru",
  defaultNS: "app",
  ns: ["app", "domain", "screens"],
  initAsync: false,
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.resolvedLanguage;
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {}
  });
}

export function t(key, options) {
  return i18n.t(key, options);
}
