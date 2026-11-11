import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

export const settingsToggleTransition = { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] };

export default function SettingsToggle({ title, options, selectedValue, onSelect }) {
  const titleId = useId();
  const shouldReduceMotion = useReducedMotion();
  const selectedIndex = options.findIndex(({ value }) => value === selectedValue);

  return (
    <section className="panel plan-section">
      <div className="section-title" id={titleId}>
        <span>{title}</span>
      </div>
      <div className="settings-options" role="group" aria-labelledby={titleId}>
        {options.map(({ value, label = value, lang }, index) => (
          <button
            key={value}
            className="action-button secondary-action settings-option"
            style={{ gridColumn: index + 1 }}
            type="button"
            lang={lang}
            aria-pressed={selectedValue === value}
            onClick={() => onSelect(value)}
          >
            <span>{label}</span>
          </button>
        ))}
        <motion.span
          className="settings-option-indicator"
          style={{ gridColumn: selectedIndex + 1 }}
          layout={shouldReduceMotion ? false : "position"}
          transition={settingsToggleTransition}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
