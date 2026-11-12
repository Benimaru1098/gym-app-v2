import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { chooseBackupFile, getBackupState, subscribeToBackupState, updateBackup } from "../platform/androidBackup.js";

function formatLastSaved(savedAt, language) {
  const timestamp = new Date(savedAt);
  const english = language === "en";
  const locale = english ? "en-US" : "ru-RU";

  return {
    date: timestamp.toLocaleDateString(locale, {
      day: english ? "numeric" : "2-digit",
      month: english ? "short" : "2-digit",
      year: "numeric",
    }),
    time: timestamp.toLocaleTimeString(locale, {
      hour: english ? "numeric" : "2-digit",
      minute: "2-digit",
      hourCycle: english ? "h12" : "h23",
    }),
  };
}

export default function AndroidBackupSettings({ fromSettings, onBack }) {
  const { t, i18n } = useTranslation("screens");
  const { loading, choosing, saving, fileName, savedAt, error } = useSyncExternalStore(subscribeToBackupState, getBackupState);
  const busy = loading || choosing || saving;

  return (
    <>
      <section className="panel plan-section backup-description">
        <h2 className="section-title">{t("backup.introTitle")}</h2>
        <p>{t("backup.purpose")}</p>
        <p>{t("backup.contents")}</p>
        <p>{t("backup.instructions")}</p>
        <p>{t("backup.updates")}</p>
      </section>

      {fileName || error ? (
        <section className="panel plan-section backup-description" aria-live="polite">
          {fileName ? <strong>{fileName}</strong> : null}
          {savedAt ? (
            <p>{t("backup.lastSaved", formatLastSaved(savedAt, i18n.resolvedLanguage))}</p>
          ) : null}
          {error ? <p className="backup-error">{t(`backup.${error}`)}</p> : null}
        </section>
      ) : null}

      <div className="action-grid">
        <button className="action-button" type="button" onClick={chooseBackupFile} disabled={busy}>
          {saving ? t("common.saving") : t(fileName ? "backup.changeLocation" : "backup.chooseLocation")}
        </button>
        {fileName && error === "writeFailed" ? (
          <button className="action-button secondary-action" type="button" onClick={updateBackup} disabled={busy}>
            {t("backup.retry")}
          </button>
        ) : null}
        {!fromSettings ? (
          <button className="action-button secondary-action" type="button" onClick={onBack} disabled={choosing}>
            {t(savedAt ? "backup.done" : "backup.later")}
          </button>
        ) : null}
      </div>
    </>
  );
}
