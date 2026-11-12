import { useTranslation } from "react-i18next";
import { APP_LANGUAGES, selectAppLanguage } from "../i18n/index.js";
import SettingsToggle from "./SettingsToggle.jsx";

const languageOptions = APP_LANGUAGES.map(({ code, label }) => ({ value: code, label, lang: code }));

export default function LanguageSettings() {
  const { t, i18n } = useTranslation("screens");

  return (
    <SettingsToggle
      title={t("settings.language")}
      options={languageOptions}
      selectedValue={i18n.resolvedLanguage}
      onSelect={selectAppLanguage}
    />
  );
}
