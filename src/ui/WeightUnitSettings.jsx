import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsToggle from "./SettingsToggle.jsx";

const WEIGHT_UNITS = ["kg", "lb"];
const weightUnitOptions = WEIGHT_UNITS.map((value) => ({ value }));
const WEIGHT_UNIT_KEY = "gym-cycle-weight-unit";
const WeightUnitContext = createContext(null);

function readPreferredUnit() {
  try {
    const storedUnit = localStorage.getItem(WEIGHT_UNIT_KEY);
    if (WEIGHT_UNITS.includes(storedUnit)) return storedUnit;
  } catch {}
  return null;
}

export function WeightUnitProvider({ children }) {
  const { i18n } = useTranslation("app");
  const [preferredUnit, setPreferredUnit] = useState(readPreferredUnit);
  const unit = preferredUnit ?? (i18n.resolvedLanguage === "en" ? "lb" : "kg");
  const selectUnit = useCallback((nextUnit) => {
    setPreferredUnit(nextUnit);
    try {
      localStorage.setItem(WEIGHT_UNIT_KEY, nextUnit);
    } catch {}
  }, []);
  const value = useMemo(() => ({ unit, selectUnit }), [unit, selectUnit]);

  return <WeightUnitContext value={value}>{children}</WeightUnitContext>;
}

export function useWeightUnit() {
  return useContext(WeightUnitContext).unit;
}

export default function WeightUnitSettings() {
  const { t } = useTranslation("screens");
  const { unit, selectUnit } = useContext(WeightUnitContext);

  return (
    <SettingsToggle
      title={t("settings.weightUnit")}
      options={weightUnitOptions}
      selectedValue={unit}
      onSelect={selectUnit}
    />
  );
}
