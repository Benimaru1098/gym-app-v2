import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { initialData } from "../data/seed.js";
import { localizeTemplateName } from "../i18n/catalog.js";
import { i18n } from "../i18n/index.js";
import { createWorkoutLogFromSession } from "../data/storage.js";
import "./guidedLearning.css";

// Each run gets its own immutable snapshots. No IndexedDB handles or backup events.
export function createPracticeStore() {
  let data = {
    ...initialData, activeWorkoutSessions: [],
    exerciseTemplates: initialData.exerciseTemplates.map(template =>
      template.id === "tpl-triceps-standard" ? { ...template, exerciseIds: template.exerciseIds.slice(0, 1) } : template),
  };
  function put(table, row) {
    data = { ...data, [table]: [...data[table].filter(item => item.id !== row.id), row] };
  }
  const store = {
    loadAppData: async () => data,
    saveExercise(exercise) {
      put("exercises", exercise);
      store.exerciseId = exercise.id;
      return { status: "saved" };
    },
    hasChestTemplate(name) {
      const key = value => value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
      return data.exerciseTemplates.some(item => item.muscleGroupId === "chest" &&
        [item.name, localizeTemplateName(item.id, item.name, i18n.resolvedLanguage)].some(value => key(value) === key(name)));
    },
    saveExerciseTemplate(template) {
      if (store.hasChestTemplate(template.name)) return { status: "duplicate" };
      put("exerciseTemplates", template);
      store.templateId = template.id;
      return { status: "saved" };
    },
    saveWorkoutGroup(day) {
      put("workoutGroups", day);
      store.dayId = day.id;
    },
    saveWorkoutGroupSelectedTemplate(dayId, muscle, templateId) {
      const day = data.workoutGroups.find(row => row.id === dayId);
      put("workoutGroups", { ...day, selectedTemplateByMuscleGroupId: { ...day.selectedTemplateByMuscleGroupId, [muscle]: templateId } });
    },
    saveActiveWorkoutSession(session) { put("activeWorkoutSessions", session); },
    finishActiveWorkoutSession(session) {
      const log = createWorkoutLogFromSession(session, new Date().toISOString());
      data = { ...data, workoutLogs: [log], activeWorkoutSessions: [] };
    },
  };
  return store;
}

function currentStep(s, store, accepted) {
  if (!s.data) return ["loading", null];
  const { exerciseId, templateId, dayId } = store;
  if (s.activeTab === "journal") return s.journalView.name === "details"
    ? ["result", ".journal-exercise-card"] : ["entry", ".journal-card"];
  if (s.templateSelector) return ["templateOption", `[data-learn-template="${templateId}"]`];
  if (s.activeTab === "home") {
    if (s.homeView.name === "activeWorkout") {
      const session = s.activeWorkoutSession;
      const index = session.currentExerciseIndex;
      const row = session.exerciseLogs[index]?.sets?.[0];
      const valid = Number(String(row?.weightKg).replace(",", ".")) > 0 && Number(row?.reps) > 0;
      const field = "set" + index;
      if (!accepted[field]) return [index ? "secondSet" : "firstSet", ".active-set-row", field, valid];
      return [index ? "finish" : "nextExercise", ".active-next-button"];
    }
    if (s.homeView.name === "preparation") {
      const day = s.data.workoutGroups.find(item => item.id === dayId);
      return day.selectedTemplateByMuscleGroupId.chest === templateId
        ? ["start", ".prep-workout-actions button"] : ["picker", '[data-learn-picker="chest"]'];
    }
    if (s.data.workoutLogs.length) return ["journal", '[data-learn-tab="journal"]'];
    return dayId ? ["openDay", `[data-learn-day="${dayId}"]`] : ["plan", '[data-learn-tab="plan"]'];
  }
  switch (s.planView.name) {
    case "exercises": return exerciseId ? ["backExercise", ".back-icon-button"] : ["addExercise", ".create-template-button"];
    case "createExercise": return !accepted.exerciseName
      ? ["exerciseName", '[name="exerciseName"]', "exerciseName", !!s.exerciseDraft.name.trim()]
      : ["saveExercise", ".template-form button[type=submit]"];
    case "templates": return templateId ? ["backTemplate", ".back-icon-button"] : ["addTemplate", ".create-template-button"];
    case "createTemplate":
      if (!accepted.templateName && store.hasChestTemplate(s.templateDraft.name)) {
        return ["duplicate", '[name="templateName"]', "templateName", false];
      }
      if (!accepted.templateName) return ["templateName", '[name="templateName"]', "templateName", !!s.templateDraft.name.trim()];
      return s.templateDraft.selectedExerciseIds.includes(exerciseId)
        ? ["saveTemplate", ".template-form button[type=submit]"] : ["include", `[data-learn-exercise="${exerciseId}"]`];
    case "createTrainingDay":
      if (!s.trainingDayDraft.selectedMuscleGroupIds.includes("chest")) return ["chest", '[data-learn-muscle="chest"]'];
      if (!s.trainingDayDraft.selectedMuscleGroupIds.includes("triceps")) return ["triceps", '[data-learn-muscle="triceps"]'];
      return ["saveDay", ".training-day-form button[type=submit]"];
    default:
      if (!exerciseId) return ["library", '[data-learn-library="chest"]'];
      if (!templateId) return ["templates", '[data-learn-templates="chest"]'];
      return dayId ? ["home", '[data-learn-tab="home"]'] : ["addDay", ".training-day-add-button"];
  }
}

// Track the real control through screen transitions, nested scrolling and the mobile keyboard.
function useSpotlight(selector, tipRef, frameRef) {
  useLayoutEffect(() => {
    const tip = tipRef.current, frame = frameRef.current;
    let target, raf, settleUntil = performance.now() + 420;
    const viewport = window.visualViewport;
    function measure() {
      raf = 0;
      const next = selector && document.querySelector(selector);
      if (next && next !== target) {
        target = next;
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        settleUntil = performance.now() + 420;
      } else if (!next) target = null;
      const top = (viewport?.offsetTop ?? 0) + 10;
      const bottom = top + (viewport?.height ?? innerHeight) - 20;
      let rect = target?.getBoundingClientRect();
      const nav = document.getElementById("bottomNav");
      const visibleEnd = nav && document.getElementById("view")?.contains(target)
        ? Math.min(bottom, nav.getBoundingClientRect().top) : bottom;
      if (rect && (rect.bottom > visibleEnd || rect.top < top) && rect.height < visibleEnd - top) {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        rect = target.getBoundingClientRect();
      }
      frame.hidden = !rect;
      if (rect) Object.assign(frame.style, {
        left: rect.left - 2 + "px", top: rect.top - 2 + "px",
        width: rect.width + 4 + "px", height: rect.height + 4 + "px",
      });
      const height = tip.offsetHeight;
      const y = !rect ? bottom - height : rect.bottom + height + 12 <= bottom
        ? rect.bottom + 10 : rect.top - height - 10;
      tip.style.top = Math.max(top, Math.min(y, bottom - height)) + "px";
      if (performance.now() < settleUntil) schedule();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(measure); }
    function guard(e) {
      if (e.type === "submit" && target?.contains(e.submitter)) return;
      if (!tip.contains(e.target) && !target?.contains(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
    const app = document.getElementById("app");
    const observer = new MutationObserver(schedule);
    observer.observe(app, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(app);
    resize.observe(tip);
    const events = ["pointerdown", "click", "submit", "focusin"];
    for (const event of events) document.addEventListener(event, guard, true);
    // Form submission originates on the form, including submission from the highlighted save button.
    document.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      observer.disconnect(); resize.disconnect(); cancelAnimationFrame(raf);
      document.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      for (const event of events) document.removeEventListener(event, guard, true);
    };
  }, [selector, tipRef, frameRef]);
}

export function Guide({ state, store, onExit }) {
  const { t } = useTranslation("screens");
  const [accepted, setAccepted] = useState({});
  const [step, selector, field, valid] = currentStep(state, store, accepted);
  const tip = useRef(null), frame = useRef(null);
  useSpotlight(selector, tip, frame);
  return <>
    <div className="learning-spotlight" aria-hidden="true" ref={frame} hidden />
    <aside className="learning-tip" ref={tip}>
      <small>{t("learning.label")}</small>
      <p aria-live="polite">{t("learning.steps." + step)}</p>
      <div>
        <button type="button" onClick={onExit}>{t(step === "result" ? "learning.done" : "learning.skip")}</button>
        {field && <button type="button" disabled={!valid} onClick={() => {
          document.activeElement?.blur();
          setAccepted(previous => ({ ...previous, [field]: true }));
        }}>{t("learning.continue")}</button>}
      </div>
    </aside>
  </>;
}
