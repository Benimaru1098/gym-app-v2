const KILOGRAMS_PER_POUND = 0.45359237;
const convertedWeightFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
  useGrouping: false,
});

export function convertWeightInput(value, fromUnit) {
  if (value == null || value === "") return "";

  const weight = Number(String(value).replace(",", "."));
  const converted = fromUnit === "lb"
    ? weight * KILOGRAMS_PER_POUND
    : weight / KILOGRAMS_PER_POUND;

  if (!Number.isFinite(converted)) return "";

  return convertedWeightFormat.format(converted);
}
