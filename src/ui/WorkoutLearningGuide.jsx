import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPracticeStore, SpotlightGuide } from "./GuidedLearning.jsx";

export { createPracticeStore };

export function Guide({ state, workoutControls, onExit }) {
  const { t } = useTranslation("screens");
  const [visitedHistory, setVisitedHistory] = useState(false);
  const [acceptedConversion, setAcceptedConversion] = useState(false);
  const viewingHistory = state.homeView.name === "exerciseHistory";

  useEffect(() => {
    if (viewingHistory) setVisitedHistory(true);
  }, [viewingHistory]);

  const session = state.activeWorkoutSession;
  const exercise = session?.exerciseLogs?.[session.currentExerciseIndex];
  if (!state.data || !exercise) return null;
  const [firstSet, secondSet] = exercise.sets ?? [];

  let step = "history";
  let selector = ".active-exercise-history-button";
  if (viewingHistory) {
    step = "historyBack";
    selector = ".journal-detail-screen";
  } else if (state.activeExerciseReplacement) {
    step = "replacementList";
    selector = ".template-select-list .template-select-option:not(:disabled)";
  } else if (visitedHistory && !exercise.replacement) {
    step = "replacement";
    selector = ".active-replace-button";
  } else if (!acceptedConversion && exercise.replacement) {
    step = workoutControls?.isConverting ? "conversionInput" : "conversion";
    selector = workoutControls?.isConverting ? ".active-set-row" : ".active-weight-conversion-button";
  } else if (acceptedConversion && !secondSet?.addedAt) {
    step = "addSet";
    selector = ".active-add-set-button";
  } else if (acceptedConversion) {
    step = workoutControls?.setTimeOpen ? "timeResult" : "setTime";
    selector = workoutControls?.setTimeOpen
      ? ".active-set-time-popover"
      : ".active-set-row:nth-child(2) .active-set-number";
  }

  const conversionReady = Boolean(firstSet?.alternateWeight && firstSet.weightKg !== "" && Number(firstSet.reps) > 0);
  return (
    <SpotlightGuide selector={selector} label={t("learning.workout.label")} blurOnOutsidePress={step === "conversionInput"} keepContentVisible={viewingHistory} actions={(
      <>
        <button type="button" onClick={onExit}>
          {t(step === "timeResult" ? "learning.done" : "learning.skip")}
        </button>
        {step === "conversionInput" ? (
          <button type="button" disabled={!conversionReady} onClick={() => {
            document.activeElement?.blur();
            setAcceptedConversion(true);
          }}>
            {t("learning.continue")}
          </button>
        ) : null}
      </>
    )}>
      {t(`learning.workout.steps.${step}`)}
    </SpotlightGuide>
  );
}
