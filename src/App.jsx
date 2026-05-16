import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearWorkoutLogs,
  deleteActiveWorkoutSessionsForWorkoutGroup,
  deleteExercise,
  deleteExerciseTemplate,
  exportAppData,
  finishActiveWorkoutSession,
  loadAppData,
  saveActiveWorkoutSession,
  saveExercise,
  saveExerciseTemplate,
  saveWorkoutGroupSelectedTemplate,
} from "./data/storage.js";
import { TRACKING_TYPES } from "./data/seed.js";
import {
  buildActiveWorkoutSessionDraft,
  buildCycleItems,
  buildExerciseCreationData,
  buildExerciseEditingData,
  buildExerciseSummariesByMuscleGroup,
  buildExercisesForMuscleGroup,
  buildJournalEntries,
  buildJournalWorkoutDetails,
  buildTemplateCreationData,
  buildTemplateEditingData,
  buildTemplateSummariesByMuscleGroup,
  buildTemplatesForMuscleGroup,
  buildWorkoutGroupCards,
  buildWorkoutPreparationData,
  getLastSetsForExercise,
  getSelectedTemplateIdForMuscleGroup,
} from "./domain/selectors.js";
import { STANDARD_TEMPLATE_NAME, isProtectedTemplate } from "./domain/templateRules.js";
import { icon } from "./ui/icons.js";
import editIconSrc from "./assets/icons/edit.svg";
import gym1Src from "./assets/illustrations/gym1.svg";
import gym2Src from "./assets/illustrations/gym2.svg";
import gym3Src from "./assets/illustrations/gym3.svg";
import "./styles.css";

const TABS = [
  { id: "home", label: "Главная", icon: "home" },
  { id: "plan", label: "План", icon: "plan" },
  { id: "journal", label: "Журнал", icon: "journal" },
];

const WORKOUT_IMAGES = [gym1Src, gym2Src, gym3Src];
const HISTORY_TAG = "gym-app-react";
const TEMPLATE_DRAG_SCROLL_EDGE = 72;
const TEMPLATE_DRAG_MAX_SCROLL_STEP = 18;
const TEMPLATE_DRAG_REORDER_ANIMATION_MS = 150;

const screenMotionVariants = {
  initial: (mode) => {
    if (mode === "secondary-open") {
      return { opacity: 0, x: 34 };
    }

    if (mode === "secondary-close") {
      return { opacity: 0, x: -34 };
    }

    return { opacity: 0, scale: 0.985, x: 0, y: 12 };
  },
  animate: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
  },
};

const bottomSheetBackdropTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
};

const bottomSheetTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

const secondaryScreenTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

const TEMPLATE_EXERCISE_ANIMATION_MS = 170;

function createInitialState() {
  return {
    activeTab: "home",
    activeWorkoutSession: null,
    activeExerciseReplacement: null,
    canInstall: false,
    data: null,
    error: null,
    exerciseDraft: { name: "" },
    homeView: { name: "overview", workoutGroupId: null },
    isLoading: true,
    isStandalone:
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true,
    journalView: { name: "overview", workoutLogId: null },
    notice: null,
    planView: { name: "overview", muscleGroupId: null, templateId: null, exerciseId: null },
    templateDraft: { name: "", selectedExerciseIds: [], isDefault: false },
    templateSelector: null,
  };
}

function normalizeHomeView(view) {
  if (view?.name === "preparation") {
    return { name: "preparation", workoutGroupId: view.workoutGroupId };
  }

  if (view?.name === "activeWorkout") {
    return { name: "activeWorkout", sessionId: view.sessionId, workoutGroupId: view.workoutGroupId ?? null };
  }

  return { name: "overview", workoutGroupId: null };
}

function normalizePlanView(view) {
  switch (view?.name) {
    case "templates":
      return { name: "templates", muscleGroupId: view.muscleGroupId, templateId: null, exerciseId: null };
    case "createTemplate":
      return { name: "createTemplate", muscleGroupId: view.muscleGroupId, templateId: null, exerciseId: null };
    case "editTemplate":
      return { name: "editTemplate", muscleGroupId: view.muscleGroupId, templateId: view.templateId, exerciseId: null };
    case "exercises":
      return { name: "exercises", muscleGroupId: view.muscleGroupId, templateId: null, exerciseId: null };
    case "createExercise":
      return { name: "createExercise", muscleGroupId: view.muscleGroupId, templateId: null, exerciseId: null };
    case "editExercise":
      return { name: "editExercise", muscleGroupId: view.muscleGroupId, templateId: null, exerciseId: view.exerciseId };
    default:
      return { name: "overview", muscleGroupId: null, templateId: null, exerciseId: null };
  }
}

function normalizeJournalView(view) {
  if (view?.name === "details") {
    return { name: "details", workoutLogId: view.workoutLogId };
  }

  return { name: "overview", workoutLogId: null };
}

function createHistoryEntry(state) {
  const entry = {
    tag: HISTORY_TAG,
    activeTab: state.activeTab,
  };

  if (state.activeTab === "home") {
    entry.homeView = normalizeHomeView(state.homeView);
  }

  if (state.activeTab === "plan") {
    entry.planView = normalizePlanView(state.planView);
  }

  if (state.activeTab === "journal") {
    entry.journalView = normalizeJournalView(state.journalView);
  }

  return entry;
}

function applyHistoryEntry(current, entry) {
  const activeTab = entry.activeTab || "home";
  const next = {
    ...current,
    activeTab,
    activeExerciseReplacement: null,
    templateSelector: null,
  };

  if (activeTab === "home") {
    next.homeView = normalizeHomeView(entry.homeView);
  }

  if (activeTab === "plan") {
    next.planView = normalizePlanView(entry.planView);
  }

  if (activeTab === "journal") {
    next.journalView = normalizeJournalView(entry.journalView);
  }

  return next;
}

function createNextState(current, patch) {
  return {
    ...current,
    ...patch,
    homeView: patch.homeView ? normalizeHomeView(patch.homeView) : current.homeView,
    journalView: patch.journalView ? normalizeJournalView(patch.journalView) : current.journalView,
    planView: patch.planView ? normalizePlanView(patch.planView) : current.planView,
  };
}

function getPlanBackTarget(planView) {
  const normalized = normalizePlanView(planView);

  switch (normalized.name) {
    case "templates":
    case "exercises":
      return { activeTab: "plan", planView: { name: "overview" } };
    case "createTemplate":
    case "editTemplate":
      return {
        activeTab: "plan",
        planView: { name: "templates", muscleGroupId: normalized.muscleGroupId },
      };
    case "createExercise":
    case "editExercise":
      return {
        activeTab: "plan",
        planView: { name: "exercises", muscleGroupId: normalized.muscleGroupId },
      };
    default:
      return null;
  }
}

function getLocalBackTarget(appState) {
  if (appState.activeTab === "home" && appState.homeView.name === "activeWorkout") {
    const session = getActiveWorkoutSessionFromState(appState);

    return {
      activeTab: "home",
      homeView: {
        name: "preparation",
        workoutGroupId: session?.workoutGroupId ?? appState.homeView.workoutGroupId,
      },
    };
  }

  if (appState.activeTab === "home" && appState.homeView.name !== "overview") {
    return { activeTab: "home", homeView: { name: "overview" } };
  }

  if (appState.activeTab === "plan") {
    return getPlanBackTarget(appState.planView);
  }

  if (appState.activeTab === "journal" && appState.journalView.name !== "overview") {
    return { activeTab: "journal", journalView: { name: "overview" } };
  }

  return null;
}

function pluralRu(value, one, few, many) {
  const number = Math.abs(value);
  const lastTwo = number % 100;
  const last = number % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }

  if (last === 1) {
    return one;
  }

  if (last >= 2 && last <= 4) {
    return few;
  }

  return many;
}

function formatRelativeDate(dateValue, emptyLabel = "ещё не было") {
  if (!dateValue) {
    return emptyLabel;
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return emptyLabel;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);

  if (diffDays <= 0) {
    return "сегодня";
  }

  if (diffDays === 1) {
    return "вчера";
  }

  if (diffDays <= 30) {
    return `${diffDays} ${pluralRu(diffDays, "день", "дня", "дней")} назад`;
  }

  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function formatLastWorkoutLabel(dateValue) {
  if (!dateValue) {
    return "Ещё не было";
  }

  return `Было: ${formatRelativeDate(dateValue)}`;
}

function formatWeightValue(weightKg) {
  const weight = Number(weightKg);

  if (Number.isNaN(weight)) {
    return String(weightKg);
  }

  return Number.isInteger(weight) ? String(weight) : String(weight).replace(".", ",");
}

function formatLastSetResult(lastSet) {
  if (!lastSet) {
    return "последний: ещё не было";
  }

  return `последний: ${formatWeightValue(lastSet.weightKg)}×${lastSet.reps}`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Дата не указана";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function formatJournalDate(dateValue) {
  if (!dateValue) {
    return "Дата не указана";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "Дата не указана";
  }

  const currentYear = new Date().getFullYear();
  const options =
    date.getFullYear() === currentYear
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };

  return new Intl.DateTimeFormat("ru-RU", options).format(date);
}

function getJournalDateParts(dateValue) {
  const date = new Date(dateValue);

  if (!dateValue || Number.isNaN(date.getTime())) {
    return {
      day: "—",
      month: "",
    };
  }

  const parts = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).formatToParts(date);

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
  };
}

function formatWorkoutSet(set) {
  const hasWeight = set?.weightKg !== undefined && set.weightKg !== null && set.weightKg !== "";
  const hasReps = set?.reps !== undefined && set.reps !== null && set.reps !== "";

  if (hasWeight && hasReps) {
    return `${formatWeightValue(set.weightKg)} кг × ${set.reps}`;
  }

  if (hasWeight) {
    return `${formatWeightValue(set.weightKg)} кг`;
  }

  if (hasReps) {
    return `${set.reps} повт.`;
  }

  return "не заполнено";
}

function formatSetList(sets) {
  const labels = (sets ?? [])
    .map((set) => {
      if (set.weightKg === undefined || set.weightKg === null || set.reps === undefined || set.reps === null) {
        return null;
      }

      return `${formatWeightValue(set.weightKg)}×${set.reps}`;
    })
    .filter(Boolean);

  return labels.length ? labels.join(" · ") : "ещё не было";
}

function normalizeWeightInput(value) {
  const cleaned = String(value).replace(/[^\d,.]/g, "");
  const separatorIndex = cleaned.search(/[,.]/);

  if (separatorIndex === -1) {
    return cleaned;
  }

  return `${cleaned.slice(0, separatorIndex + 1)}${cleaned.slice(separatorIndex + 1).replace(/[,.]/g, "")}`;
}

function normalizeRepsInput(value) {
  return String(value).replace(/\D/g, "");
}

function renumberSetRows(sets) {
  return sets.map((set, index) => ({
    ...set,
    setNumber: index + 1,
  }));
}

function createActiveSetRowsFromPrevious(previousSets) {
  const sourceSets = previousSets.length
    ? previousSets
    : Array.from({ length: 4 }, (_, index) => ({ setNumber: index + 1, weightKg: "", reps: "" }));

  return sourceSets.map((set, index) => ({
    setNumber: index + 1,
    weightKg: set.weightKg === undefined || set.weightKg === null ? "" : String(set.weightKg),
    reps: set.reps === undefined || set.reps === null ? "" : String(set.reps),
  }));
}

function getActiveWorkoutSessionFromState(appState) {
  const homeSessionId = appState.homeView?.name === "activeWorkout" ? appState.homeView.sessionId : null;

  if (appState.activeWorkoutSession && (!homeSessionId || appState.activeWorkoutSession.id === homeSessionId)) {
    return appState.activeWorkoutSession;
  }

  if (!homeSessionId) {
    return appState.activeWorkoutSession;
  }

  return appState.data?.activeWorkoutSessions?.find((session) => session.id === homeSessionId) ?? null;
}

function getActiveWorkoutSessionForGroup(appState, workoutGroupId) {
  const sessions = [
    ...(appState.data?.activeWorkoutSessions ?? []),
    appState.activeWorkoutSession,
  ]
    .filter(Boolean)
    .filter((session) => session.workoutGroupId === workoutGroupId && session.status !== "completed");
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  return [...sessionsById.values()].sort((a, b) => {
    const firstTime = new Date(a.updatedAt ?? a.startedAt ?? 0).getTime();
    const secondTime = new Date(b.updatedAt ?? b.startedAt ?? 0).getTime();
    return secondTime - firstTime;
  })[0] ?? null;
}

function createId(prefix) {
  const safeRandom =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}-${safeRandom}`;
}

function getViewElement() {
  return document.getElementById("view");
}

function getViewScrollKey(appState) {
  switch (appState.activeTab) {
    case "home": {
      const normalized = normalizeHomeView(appState.homeView);

      return [
        "home",
        normalized.name,
        normalized.workoutGroupId || "",
        normalized.sessionId || "",
      ].join(":");
    }
    case "plan": {
      const normalized = normalizePlanView(appState.planView);

      return [
        "plan",
        normalized.name,
        normalized.muscleGroupId || "",
        normalized.templateId || "",
        normalized.exerciseId || "",
      ].join(":");
    }
    case "journal": {
      const normalized = normalizeJournalView(appState.journalView);

      return [
        "journal",
        normalized.name,
        normalized.workoutLogId || "",
      ].join(":");
    }
    default:
      return appState.activeTab || "home";
  }
}

function getViewDepth(appState) {
  switch (appState.activeTab) {
    case "home": {
      const normalized = normalizeHomeView(appState.homeView);

      if (normalized.name === "activeWorkout") {
        return 2;
      }

      return normalized.name === "overview" ? 0 : 1;
    }
    case "plan": {
      const normalized = normalizePlanView(appState.planView);

      if (
        normalized.name === "createTemplate" ||
        normalized.name === "editTemplate" ||
        normalized.name === "createExercise" ||
        normalized.name === "editExercise"
      ) {
        return 2;
      }

      return normalized.name === "overview" ? 0 : 1;
    }
    case "journal": {
      const normalized = normalizeJournalView(appState.journalView);

      return normalized.name === "overview" ? 0 : 1;
    }
    default:
      return 0;
  }
}

function getScreenAnimationMode(current, next) {
  if (!current || !next || current.activeTab !== next.activeTab) {
    return "main";
  }

  const currentDepth = getViewDepth(current);
  const nextDepth = getViewDepth(next);

  if (nextDepth > currentDepth) {
    return "secondary-open";
  }

  if (nextDepth < currentDepth) {
    return "secondary-close";
  }

  if (nextDepth > 0 && getViewScrollKey(current) !== getViewScrollKey(next)) {
    return "secondary-open";
  }

  return "main";
}

function SvgIcon({ name }) {
  return <span className="icon-wrap" dangerouslySetInnerHTML={{ __html: icon(name) }} />;
}

function ClickIndicator() {
  return (
    <svg className="click-indicator" viewBox="0 0 26 22" width="26" height="22" aria-hidden="true" focusable="false">
      <line x1="4" y1="5" x2="24" y2="5"></line>
      <line x1="4" y1="11" x2="24" y2="11"></line>
      <line x1="4" y1="17" x2="24" y2="17"></line>
    </svg>
  );
}

function createTemplateDragPlaceholder(itemRect) {
  const placeholder = document.createElement("div");
  placeholder.className = "template-selected-placeholder";
  placeholder.style.height = `${itemRect.height}px`;
  placeholder.setAttribute("aria-hidden", "true");
  return placeholder;
}

function getFixedContainingBlockOffset(element) {
  let node = element.parentElement;

  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const willChange = style.willChange || "";
    const createsFixedContainingBlock =
      style.transform !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      willChange.includes("transform") ||
      willChange.includes("perspective") ||
      willChange.includes("filter");

    if (createsFixedContainingBlock) {
      const rect = node.getBoundingClientRect();

      return {
        left: rect.left,
        top: rect.top,
      };
    }

    node = node.parentElement;
  }

  return {
    left: 0,
    top: 0,
  };
}

function positionTemplateDragItem(drag, clientX, clientY) {
  drag.item.style.left = `${clientX - drag.offsetX - drag.fixedOriginLeft}px`;
  drag.item.style.top = `${clientY - drag.offsetY - drag.fixedOriginTop}px`;
}

function getTemplateDragAnimatedItems(list) {
  return Array.from(list.querySelectorAll("[data-selected-exercise-item]:not(.is-dragging)"));
}

function captureTemplateDragRects(list) {
  return new Map(
    getTemplateDragAnimatedItems(list).map((item) => [item, item.getBoundingClientRect()]),
  );
}

function animateTemplateDragReorder(list, previousRects) {
  getTemplateDragAnimatedItems(list).forEach((item) => {
    const previousRect = previousRects.get(item);
    if (!previousRect) {
      return;
    }

    const nextRect = item.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }

    window.clearTimeout(item.templateDragAnimationTimer);
    item.style.transition = "none";
    item.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    requestAnimationFrame(() => {
      item.style.transition = `transform ${TEMPLATE_DRAG_REORDER_ANIMATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      item.style.transform = "";
    });

    item.templateDragAnimationTimer = window.setTimeout(() => {
      item.style.transition = "";
      item.style.transform = "";
      delete item.templateDragAnimationTimer;
    }, TEMPLATE_DRAG_REORDER_ANIMATION_MS + 40);
  });
}

function moveTemplateDragPlaceholder(drag, clientY) {
  const items = Array.from(drag.list.querySelectorAll("[data-selected-exercise-item]:not(.is-dragging)"));
  const nextItem = items.find((item) => {
    const rect = item.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  const isAlreadyPlaced = nextItem
    ? drag.placeholder.nextElementSibling === nextItem
    : drag.placeholder === drag.list.lastElementChild;

  if (isAlreadyPlaced) {
    return;
  }

  const previousRects = captureTemplateDragRects(drag.list);

  if (nextItem) {
    drag.list.insertBefore(drag.placeholder, nextItem);
  } else {
    drag.list.appendChild(drag.placeholder);
  }

  animateTemplateDragReorder(drag.list, previousRects);
  updateSelectedExerciseNumbers(drag.list);
}

function getTemplateDragScrollStep(drag) {
  const rect = drag.list.getBoundingClientRect();
  const topDistance = drag.lastClientY - rect.top;
  const bottomDistance = rect.bottom - drag.lastClientY;
  const maxScrollTop = drag.list.scrollHeight - drag.list.clientHeight;

  if (topDistance < TEMPLATE_DRAG_SCROLL_EDGE && drag.list.scrollTop > 0) {
    const strength = 1 - Math.max(topDistance, 0) / TEMPLATE_DRAG_SCROLL_EDGE;
    return -Math.ceil(strength * TEMPLATE_DRAG_MAX_SCROLL_STEP);
  }

  if (bottomDistance < TEMPLATE_DRAG_SCROLL_EDGE && drag.list.scrollTop < maxScrollTop) {
    const strength = 1 - Math.max(bottomDistance, 0) / TEMPLATE_DRAG_SCROLL_EDGE;
    return Math.ceil(strength * TEMPLATE_DRAG_MAX_SCROLL_STEP);
  }

  return 0;
}

function runTemplateAutoScroll(dragRef, drag) {
  if (dragRef.current !== drag) {
    return;
  }

  const step = getTemplateDragScrollStep(drag);
  if (step === 0) {
    drag.autoScrollFrame = null;
    return;
  }

  drag.list.scrollTop += step;
  moveTemplateDragPlaceholder(drag, drag.lastClientY);
  drag.autoScrollFrame = window.requestAnimationFrame(() => runTemplateAutoScroll(dragRef, drag));
}

function scheduleTemplateAutoScroll(dragRef, drag) {
  if (drag.autoScrollFrame) {
    return;
  }

  drag.autoScrollFrame = window.requestAnimationFrame(() => runTemplateAutoScroll(dragRef, drag));
}

function stopTemplateAutoScroll(drag) {
  if (!drag?.autoScrollFrame) {
    return;
  }

  window.cancelAnimationFrame(drag.autoScrollFrame);
  drag.autoScrollFrame = null;
}

function resetTemplateDragItem(item) {
  item.style.position = "";
  item.style.left = "";
  item.style.top = "";
  item.style.width = "";
  item.style.height = "";
  item.style.zIndex = "";
  item.style.pointerEvents = "";
  item.style.margin = "";
}

function EditIconButton({ label, onClick }) {
  return (
    <button className="template-edit-button" type="button" aria-label={label} onClick={onClick}>
      <img src={editIconSrc} alt="" aria-hidden="true" />
    </button>
  );
}

function App() {
  const [state, setState] = useState(createInitialState);
  const stateRef = useRef(state);
  const noticeTimerRef = useRef(null);
  const deferredInstallPromptRef = useRef(null);
  const scrollPositionsRef = useRef(new Map());
  const templateDragRef = useRef(null);
  const activeWorkoutSaveQueueRef = useRef(Promise.resolve());
  const screenAnimationModeRef = useRef("main");
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback((patchOrUpdater) => {
    const current = stateRef.current;
    const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(current) : patchOrUpdater;
    const next = { ...current, ...patch };

    stateRef.current = next;
    setState(next);
  }, []);

  const showNotice = useCallback(
    (message, type = "info") => {
      window.clearTimeout(noticeTimerRef.current);
      patchState({ notice: { message, type } });
      noticeTimerRef.current = window.setTimeout(() => {
        patchState({ notice: null });
      }, 2600);
    },
    [patchState],
  );

  const refreshData = useCallback(async () => {
    const data = await loadAppData();
    patchState({ data, error: null, isLoading: false });
    return data;
  }, [patchState]);

  const saveCurrentScrollPosition = useCallback(() => {
    const viewElement = getViewElement();
    if (!viewElement) {
      return;
    }

    scrollPositionsRef.current.set(getViewScrollKey(stateRef.current), viewElement.scrollTop);
  }, []);

  const restoreScrollPosition = useCallback((appState) => {
    const viewElement = getViewElement();
    if (!viewElement) {
      return;
    }

    const key = getViewScrollKey(appState);
    const savedTop = scrollPositionsRef.current.get(key);
    viewElement.scrollTop = Number.isFinite(savedTop) ? savedTop : 0;
  }, []);

  const writeHistoryState = useCallback((method = "push") => {
    const entry = createHistoryEntry(stateRef.current);
    if (method === "replace") {
      window.history.replaceState(entry, "");
      return;
    }

    window.history.pushState(entry, "");
  }, []);

  const navigate = useCallback(
    (patch, { history = "push", scroll = "top" } = {}) => {
      const current = stateRef.current;
      const next = createNextState(current, patch);

      saveCurrentScrollPosition();
      screenAnimationModeRef.current = getScreenAnimationMode(current, next);

      stateRef.current = next;
      setState(next);

      requestAnimationFrame(() => {
        if (scroll === "restore") {
          restoreScrollPosition(next);
          return;
        }

        if (scroll === "top") {
          getViewElement()?.scrollTo({ top: 0 });
        }
      });

      if (history === "replace") {
        window.history.replaceState(createHistoryEntry(next), "");
      } else if (history === "push") {
        window.history.pushState(createHistoryEntry(next), "");
      }
    },
    [restoreScrollPosition, saveCurrentScrollPosition],
  );

  const goBack = useCallback(() => {
    const current = stateRef.current;
    const target = getLocalBackTarget(current);

    if (target) {
      navigate(target, {
        history: "replace",
        scroll: "restore",
      });
      return;
    }

    if (window.history.state?.tag === HISTORY_TAG) {
      window.history.back();
    }
  }, [navigate]);

  useEffect(() => {
    refreshData().catch((error) => {
      console.error(error);
      patchState({ error: "Не удалось загрузить данные", isLoading: false });
    });
  }, [patchState, refreshData]);

  useEffect(() => {
    writeHistoryState("replace");

    const handlePopState = (event) => {
      const entry = event.state;

      if (!entry || entry.tag !== HISTORY_TAG) {
        return;
      }

      saveCurrentScrollPosition();

      const target = getLocalBackTarget(stateRef.current);

      if (target) {
        const current = stateRef.current;
        const next = createNextState(current, target);
        screenAnimationModeRef.current = getScreenAnimationMode(current, next);
        stateRef.current = next;
        setState(next);
        window.history.replaceState(createHistoryEntry(next), "");

        requestAnimationFrame(() => restoreScrollPosition(next));

        return;
      }

      const current = stateRef.current;
      const next = applyHistoryEntry(current, entry);
      screenAnimationModeRef.current = getScreenAnimationMode(current, next);
      stateRef.current = next;
      setState(next);

      requestAnimationFrame(() => restoreScrollPosition(next));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [restoreScrollPosition, saveCurrentScrollPosition, writeHistoryState]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredInstallPromptRef.current = event;
      patchState({ canInstall: true });
    };

    const handleInstalled = () => {
      deferredInstallPromptRef.current = null;
      patchState({ canInstall: false, isStandalone: true });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [patchState]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });

      if ("caches" in window) {
        caches.keys().then((cacheNames) => {
          cacheNames
            .filter((cacheName) => cacheName.startsWith("gym-cycle"))
            .forEach((cacheName) => caches.delete(cacheName));
        });
      }

      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker);
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  useEffect(() => {
    WORKOUT_IMAGES.forEach((source) => {
      const image = new Image();
      image.src = source;
    });
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = templateDragRef.current;
      if (!drag) {
        return;
      }

      event.preventDefault();
      drag.lastClientY = event.clientY;

      positionTemplateDragItem(drag, event.clientX, event.clientY);
      moveTemplateDragPlaceholder(drag, event.clientY);
      scheduleTemplateAutoScroll(templateDragRef, drag);
    };

    const handlePointerUp = () => {
      const drag = templateDragRef.current;
      if (!drag) {
        return;
      }

      stopTemplateAutoScroll(drag);
      drag.handle.releasePointerCapture?.(drag.pointerId);
      if (drag.placeholder.parentElement === drag.list) {
        drag.list.insertBefore(drag.item, drag.placeholder);
      } else {
        drag.list.appendChild(drag.item);
      }
      drag.placeholder.remove();
      drag.item.classList.remove("is-dragging");
      drag.list.classList.remove("is-dragging-list");
      document.body.classList.remove("template-drag-active");
      resetTemplateDragItem(drag.item);
      updateSelectedExerciseNumbers(drag.list);

      const selectedExerciseIds = Array.from(drag.list.querySelectorAll("[data-selected-exercise-item]"))
        .map((item) => item.dataset.exerciseId)
        .filter(Boolean);

      patchState((current) => ({
        templateDraft: {
          ...current.templateDraft,
          selectedExerciseIds,
        },
      }));

      templateDragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [patchState]);

  const handleInstallApp = useCallback(async () => {
    const prompt = deferredInstallPromptRef.current;
    if (!prompt) {
      showNotice("Установка доступна из меню браузера");
      return;
    }

    prompt.prompt();
    await prompt.userChoice;
    deferredInstallPromptRef.current = null;
    patchState({ canInstall: false });
  }, [patchState, showNotice]);

  const handleTabChange = useCallback(
    (tabId) => {
      const current = stateRef.current;
      if (tabId === current.activeTab) {
        return;
      }

      const nextPatch = { activeTab: tabId };

      if (tabId !== current.activeTab) {
        nextPatch.templateSelector = null;
        nextPatch.activeExerciseReplacement = null;
      }

      const hasOpenNestedView =
        current.activeTab === "home"
          ? current.homeView.name !== "overview"
          : current.activeTab === "plan"
            ? current.planView.name !== "overview"
            : current.activeTab === "journal"
              ? current.journalView.name !== "overview"
              : false;

      navigate(nextPatch, { history: hasOpenNestedView ? "replace" : "push", scroll: "restore" });
    },
    [navigate],
  );

  const openWorkoutPreparation = useCallback(
    (workoutGroupId) => {
      navigate({ activeTab: "home", homeView: { name: "preparation", workoutGroupId } });
    },
    [navigate],
  );

  const openTemplateGroup = useCallback(
    (muscleGroupId) => {
      navigate({ activeTab: "plan", planView: { name: "templates", muscleGroupId } });
    },
    [navigate],
  );

  const openTemplateCreate = useCallback(
    (muscleGroupId) => {
      const data = stateRef.current.data;
      const hasDefaultTemplate = data.exerciseTemplates.some(
        (template) => template.muscleGroupId === muscleGroupId && template.isDefault && !template.isArchived,
      );
      navigate({
        activeTab: "plan",
        planView: { name: "createTemplate", muscleGroupId },
        templateDraft: {
          name: "",
          selectedExerciseIds: [],
          isDefault: !hasDefaultTemplate,
        },
      });
    },
    [navigate],
  );

  const openTemplateEdit = useCallback(
    (muscleGroupId, templateId) => {
  const details = buildTemplateEditingData(stateRef.current.data, templateId);
      navigate({
        activeTab: "plan",
        planView: { name: "editTemplate", muscleGroupId, templateId },
        templateDraft: {
          name: details.template?.name || "",
          selectedExerciseIds: [...(details.template?.exerciseIds || [])],
          isDefault: Boolean(details.template?.isDefault),
        },
      });
    },
    [navigate],
  );

  const openExerciseGroup = useCallback(
    (muscleGroupId) => {
      navigate({ activeTab: "plan", planView: { name: "exercises", muscleGroupId } });
    },
    [navigate],
  );

  const openExerciseCreate = useCallback(
    (muscleGroupId) => {
      navigate({
        activeTab: "plan",
        planView: { name: "createExercise", muscleGroupId },
        exerciseDraft: { name: "" },
      });
    },
    [navigate],
  );

  const openExerciseEdit = useCallback(
    (muscleGroupId, exerciseId) => {
  const details = buildExerciseEditingData(stateRef.current.data, exerciseId);
      navigate({
        activeTab: "plan",
        planView: { name: "editExercise", muscleGroupId, exerciseId },
        exerciseDraft: { name: details.exercise?.name || "" },
      });
    },
    [navigate],
  );

  const openTemplateSelector = useCallback((muscleGroupId, workoutGroupId) => {
    patchState({ templateSelector: { muscleGroupId, workoutGroupId } });
  }, [patchState]);

  const closeTemplateSelector = useCallback(() => {
    patchState({ templateSelector: null });
  }, [patchState]);

  const selectWorkoutTemplate = useCallback(
    async (templateId) => {
      const current = stateRef.current;
      const selector = current.templateSelector;
      if (!selector) {
        return;
      }

      try {
        await saveWorkoutGroupSelectedTemplate(selector.workoutGroupId, selector.muscleGroupId, templateId);
        await refreshData();
        patchState({ templateSelector: null });
        showNotice("Шаблон выбран");
      } catch (error) {
        console.error(error);
        showNotice("Не удалось выбрать шаблон", "error");
      }
    },
    [patchState, refreshData, showNotice],
  );

  const persistActiveWorkoutSession = useCallback(
    (session, { showError = false } = {}) => {
      const saveTask = () => saveActiveWorkoutSession(session);

      activeWorkoutSaveQueueRef.current = activeWorkoutSaveQueueRef.current
        .catch(() => {})
        .then(saveTask);

      return activeWorkoutSaveQueueRef.current.catch((error) => {
        console.error(error);
        if (showError) {
          showNotice("Не удалось сохранить тренировку", "error");
        }
      });
    },
    [showNotice],
  );

  const setActiveWorkoutSession = useCallback(
    (session) => {
      const nextSession = {
        ...session,
        updatedAt: new Date().toISOString(),
      };

      stateRef.current = {
        ...stateRef.current,
        activeWorkoutSession: nextSession,
      };
      patchState({ activeWorkoutSession: nextSession });
      return nextSession;
    },
    [patchState],
  );

  const updateActiveWorkoutSession = useCallback(
    (updater, { showError = false } = {}) => {
      const currentSession = getActiveWorkoutSessionFromState(stateRef.current);

      if (!currentSession) {
        return null;
      }

      const nextSession = setActiveWorkoutSession(updater(currentSession));
      persistActiveWorkoutSession(nextSession, { showError });
      return nextSession;
    },
    [persistActiveWorkoutSession, setActiveWorkoutSession],
  );

  const handleStartWorkout = useCallback(
    async (workoutGroupId) => {
      const current = stateRef.current;
      const unfinishedSession = getActiveWorkoutSessionForGroup(current, workoutGroupId);

      if (unfinishedSession && !window.confirm("Начать новую тренировку? Прошлая незавершённая тренировка будет удалена.")) {
        return;
      }

      const startedAt = new Date().toISOString();
      const session = buildActiveWorkoutSessionDraft(
        current.data,
        workoutGroupId,
        createId("active-workout"),
        startedAt,
      );

      if (!session) {
        showNotice("Тренировка не найдена", "error");
        return;
      }

      if (!session.exerciseLogs.length) {
        showNotice("В плане нет упражнений", "error");
        return;
      }

      try {
        if (unfinishedSession) {
          await activeWorkoutSaveQueueRef.current.catch(() => {});
          await deleteActiveWorkoutSessionsForWorkoutGroup(workoutGroupId);
        }

        await saveActiveWorkoutSession(session);
        const refreshedData = await refreshData();
        navigate(
          {
            activeTab: "home",
            activeWorkoutSession: session,
            activeExerciseReplacement: null,
            data: refreshedData,
            homeView: { name: "activeWorkout", sessionId: session.id, workoutGroupId },
          },
          { history: "push", scroll: "top" },
        );
        showNotice("Тренировка начата");
      } catch (error) {
        console.error(error);
        showNotice("Не удалось начать тренировку", "error");
      }
    },
    [navigate, refreshData, showNotice],
  );

  const handleContinueWorkout = useCallback(
    (sessionId) => {
      const current = stateRef.current;
      const session = current.activeWorkoutSession?.id === sessionId
        ? current.activeWorkoutSession
        : current.data?.activeWorkoutSessions?.find((item) => item.id === sessionId) ?? null;

      if (!session) {
        showNotice("Незавершённая тренировка не найдена", "error");
        return;
      }

      navigate(
        {
          activeTab: "home",
          activeWorkoutSession: session,
          activeExerciseReplacement: null,
          homeView: { name: "activeWorkout", sessionId: session.id, workoutGroupId: session.workoutGroupId },
        },
        { history: "push", scroll: "top" },
      );
    },
    [navigate, showNotice],
  );

  const handleActiveSetChange = useCallback(
    (exerciseIndex, setIndex, field, value) => {
      const normalizedValue = field === "weightKg" ? normalizeWeightInput(value) : normalizeRepsInput(value);

      updateActiveWorkoutSession((session) => ({
        ...session,
        exerciseLogs: session.exerciseLogs.map((exerciseLog, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) {
            return exerciseLog;
          }

          return {
            ...exerciseLog,
            sets: renumberSetRows(
              (exerciseLog.sets?.length ? exerciseLog.sets : [{ setNumber: 1, weightKg: "", reps: "" }]).map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, [field]: normalizedValue } : set,
              ),
            ),
          };
        }),
      }));
    },
    [updateActiveWorkoutSession],
  );

  const handleAddActiveSet = useCallback(
    (exerciseIndex) => {
      updateActiveWorkoutSession((session) => ({
        ...session,
        exerciseLogs: session.exerciseLogs.map((exerciseLog, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) {
            return exerciseLog;
          }

          return {
            ...exerciseLog,
            sets: renumberSetRows([
              ...(exerciseLog.sets ?? []),
              { setNumber: (exerciseLog.sets ?? []).length + 1, weightKg: "", reps: "" },
            ]),
          };
        }),
      }));
    },
    [updateActiveWorkoutSession],
  );

  const handleRemoveActiveSet = useCallback(
    (exerciseIndex, setIndex) => {
      updateActiveWorkoutSession((session) => ({
        ...session,
        exerciseLogs: session.exerciseLogs.map((exerciseLog, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) {
            return exerciseLog;
          }

          if ((exerciseLog.sets ?? []).length <= 1) {
            return exerciseLog;
          }

          return {
            ...exerciseLog,
            sets: renumberSetRows((exerciseLog.sets ?? []).filter((_, currentSetIndex) => currentSetIndex !== setIndex)),
          };
        }),
      }));
    },
    [updateActiveWorkoutSession],
  );

  const openExerciseReplacement = useCallback((exerciseIndex) => {
    patchState({ activeExerciseReplacement: { exerciseIndex } });
  }, [patchState]);

  const closeExerciseReplacement = useCallback(() => {
    patchState({ activeExerciseReplacement: null });
  }, [patchState]);

  const selectReplacementExercise = useCallback(
    (exerciseId) => {
      const current = stateRef.current;
      const session = getActiveWorkoutSessionFromState(current);
      const exerciseIndex = current.activeExerciseReplacement?.exerciseIndex;
      const exerciseLog = session?.exerciseLogs?.[exerciseIndex];
      const exercise = current.data?.exercises?.find((item) => item.id === exerciseId && !item.isArchived);

      if (!session || !exerciseLog || !exercise) {
        showNotice("Не удалось заменить упражнение", "error");
        return;
      }

      if (exercise.muscleGroupId !== exerciseLog.muscleGroupId) {
        showNotice("Упражнение из другой мышцы", "error");
        return;
      }

      const plannedExerciseId = exerciseLog.plannedExerciseId ?? exerciseLog.exerciseId;
      const usedExerciseIds = new Set(
        session.exerciseLogs
          .filter((_, currentExerciseIndex) => currentExerciseIndex !== exerciseIndex)
          .map((item) => item.exerciseId)
          .filter(Boolean),
      );

      if (usedExerciseIds.has(exercise.id) || exercise.id === exerciseLog.exerciseId) {
        return;
      }

      const previousSets = getLastSetsForExercise(current.data, exercise.id);

      updateActiveWorkoutSession((activeSession) => ({
        ...activeSession,
        exerciseLogs: activeSession.exerciseLogs.map((item, currentExerciseIndex) => {
          if (currentExerciseIndex !== exerciseIndex) {
            return item;
          }

          const plannedExerciseNameSnapshot = item.plannedExerciseNameSnapshot ?? item.exerciseNameSnapshot;
          const isReplacement = exercise.id !== plannedExerciseId;

          return {
            ...item,
            exerciseId: exercise.id,
            exerciseNameSnapshot: exercise.name,
            plannedExerciseId,
            plannedExerciseNameSnapshot,
            trackingType: exercise.trackingType ?? item.trackingType,
            previousSets,
            replacement: isReplacement
              ? {
                  plannedExerciseId,
                  plannedExerciseNameSnapshot,
                  exerciseId: exercise.id,
                  exerciseNameSnapshot: exercise.name,
                  replacedAt: new Date().toISOString(),
                }
              : null,
            sets: createActiveSetRowsFromPrevious(previousSets),
          };
        }),
      }), { showError: true });

      patchState({ activeExerciseReplacement: null });
      showNotice("Упражнение заменено");
    },
    [patchState, showNotice, updateActiveWorkoutSession],
  );

  const handleActivePreviousExercise = useCallback(async () => {
    const currentSession = getActiveWorkoutSessionFromState(stateRef.current);

    if (!currentSession) {
      return;
    }

    const previousIndex = Math.max(Number(currentSession.currentExerciseIndex ?? 0) - 1, 0);
    const nextSession = setActiveWorkoutSession({
      ...currentSession,
      currentExerciseIndex: previousIndex,
    });

    await persistActiveWorkoutSession(nextSession, { showError: true });
    requestAnimationFrame(() => getViewElement()?.scrollTo({ top: 0 }));
  }, [persistActiveWorkoutSession, setActiveWorkoutSession]);

  const handleActiveNextExercise = useCallback(async () => {
    const currentSession = getActiveWorkoutSessionFromState(stateRef.current);

    if (!currentSession) {
      return;
    }

    const nextIndex = Math.min(
      Number(currentSession.currentExerciseIndex ?? 0) + 1,
      currentSession.exerciseLogs.length - 1,
    );
    const nextSession = setActiveWorkoutSession({
      ...currentSession,
      currentExerciseIndex: nextIndex,
    });

    await persistActiveWorkoutSession(nextSession, { showError: true });
    requestAnimationFrame(() => getViewElement()?.scrollTo({ top: 0 }));
  }, [persistActiveWorkoutSession, setActiveWorkoutSession]);

  const handleFinishActiveWorkout = useCallback(async () => {
    const currentSession = getActiveWorkoutSessionFromState(stateRef.current);

    if (!currentSession) {
      showNotice("Активная тренировка не найдена", "error");
      return;
    }

    const finalSession = {
      ...currentSession,
      updatedAt: new Date().toISOString(),
    };

    try {
      await activeWorkoutSaveQueueRef.current.catch(() => {});
      await finishActiveWorkoutSession(finalSession);
      activeWorkoutSaveQueueRef.current = Promise.resolve();
      const refreshedData = await refreshData();
      navigate(
        {
          activeTab: "home",
          activeWorkoutSession: null,
          activeExerciseReplacement: null,
          data: refreshedData,
          homeView: { name: "overview" },
        },
        { history: "replace", scroll: "top" },
      );
      showNotice("Тренировка сохранена");
    } catch (error) {
      console.error(error);
      showNotice("Не удалось завершить тренировку", "error");
    }
  }, [navigate, refreshData, showNotice]);

  const openJournalWorkout = useCallback(
    (workoutLogId) => {
      navigate({ activeTab: "journal", journalView: { name: "details", workoutLogId } });
    },
    [navigate],
  );

  const handleTemplateNameChange = useCallback((event) => {
    const value = event.target.value;
    patchState((current) => ({
      templateDraft: { ...current.templateDraft, name: value },
    }));
  }, [patchState]);

  const handleTemplateDefaultChange = useCallback((event) => {
    const checked = event.target.checked;
    patchState((current) => ({
      templateDraft: { ...current.templateDraft, isDefault: checked },
    }));
  }, [patchState]);

  const addDraftExercise = useCallback((exerciseId) => {
    patchState((current) => {
      if (current.templateDraft.selectedExerciseIds.includes(exerciseId)) {
        return {};
      }

      return {
        templateDraft: {
          ...current.templateDraft,
          selectedExerciseIds: [...current.templateDraft.selectedExerciseIds, exerciseId],
        },
      };
    });
  }, [patchState]);

  const removeDraftExercise = useCallback((exerciseId) => {
    patchState((current) => ({
      templateDraft: {
        ...current.templateDraft,
        selectedExerciseIds: current.templateDraft.selectedExerciseIds.filter((id) => id !== exerciseId),
      },
    }));
  }, [patchState]);

  const handleTemplateDragStart = useCallback((event) => {
    const handle = event.currentTarget;
    const item = handle.closest("[data-selected-exercise-item]");
    const list = handle.closest("[data-selected-exercise-list]");

    if (!item || !list) {
      return;
    }

    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    const rect = item.getBoundingClientRect();
    const fixedOffset = getFixedContainingBlockOffset(item);
    const placeholder = createTemplateDragPlaceholder(rect);
    list.insertBefore(placeholder, item);
    item.classList.add("is-dragging");
    list.classList.add("is-dragging-list");
    document.body.classList.add("template-drag-active");

    item.style.position = "fixed";
    item.style.width = `${rect.width}px`;
    item.style.height = `${rect.height}px`;
    item.style.zIndex = "1000";
    item.style.pointerEvents = "none";
    item.style.margin = "0";

    const drag = {
      autoScrollFrame: null,
      fixedOriginLeft: fixedOffset.left,
      fixedOriginTop: fixedOffset.top,
      handle,
      item,
      lastClientY: event.clientY,
      list,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      placeholder,
      pointerId: event.pointerId,
    };

    positionTemplateDragItem(drag, event.clientX, event.clientY);
    moveTemplateDragPlaceholder(drag, event.clientY);
    templateDragRef.current = drag;
  }, []);

  const handleSaveTemplate = useCallback(
    async (event) => {
      event.preventDefault();
      const current = stateRef.current;
      const { planView, templateDraft, data } = current;
      const details =
        planView.name === "editTemplate"
          ? buildTemplateEditingData(data, planView.templateId)
          : buildTemplateCreationData(data, planView.muscleGroupId);

      const protectedTemplate = isProtectedTemplate(details.template);
      const name = protectedTemplate ? details.template.name : templateDraft.name.trim();

      if (!name) {
        showNotice("Введите название шаблона", "error");
        return;
      }

      if (!templateDraft.selectedExerciseIds.length) {
        showNotice("Выберите хотя бы одно упражнение", "error");
        return;
      }

      const template = {
        ...(details.template || {}),
        id: details.template?.id || createId("template"),
        muscleGroupId: details.template?.muscleGroupId || planView.muscleGroupId,
        name,
        exerciseIds: [...templateDraft.selectedExerciseIds],
        isDefault: Boolean(templateDraft.isDefault),
        isArchived: Boolean(details.template?.isArchived),
        isSystem: Boolean(details.template?.isSystem || name === STANDARD_TEMPLATE_NAME),
        usageCount: Number(details.template?.usageCount || 0),
      };

      try {
        await saveExerciseTemplate(template);
        await refreshData();
        showNotice("Шаблон сохранён");
        goBack();
      } catch (error) {
        console.error(error);
        showNotice("Не удалось сохранить шаблон", "error");
      }
    },
    [goBack, refreshData, showNotice],
  );

  const handleDeleteTemplate = useCallback(async () => {
    const current = stateRef.current;
    const { planView, data } = current;
    const details = buildTemplateEditingData(data, planView.templateId);

    if (!details.template) {
      return;
    }

    if (isProtectedTemplate(details.template)) {
      showNotice("Шаблон Стандарт нельзя удалить", "error");
      return;
    }

    if (!window.confirm("Удалить шаблон?")) {
      return;
    }

    try {
      const result = await deleteExerciseTemplate(details.template.id);
      await refreshData();
      showNotice(result.status === "archived" ? "Шаблон архивирован" : "Шаблон удалён");
      goBack();
    } catch (error) {
      console.error(error);
      showNotice("Не удалось удалить шаблон", "error");
    }
  }, [goBack, refreshData, showNotice]);

  const handleExerciseNameChange = useCallback((event) => {
    const value = event.target.value;
    patchState({ exerciseDraft: { name: value } });
  }, [patchState]);

  const handleSaveExercise = useCallback(
    async (event) => {
      event.preventDefault();
      const current = stateRef.current;
      const { planView, exerciseDraft, data } = current;
      const details =
        planView.name === "editExercise"
          ? buildExerciseEditingData(data, planView.exerciseId)
          : buildExerciseCreationData(data, planView.muscleGroupId);

      const name = exerciseDraft.name.trim();
      if (!name) {
        showNotice("Введите название упражнения", "error");
        return;
      }

      const exercise = {
        ...(details.exercise || {}),
        id: details.exercise?.id || createId("exercise"),
        name,
        muscleGroupId: details.exercise?.muscleGroupId || planView.muscleGroupId,
        trackingType: details.exercise?.trackingType || TRACKING_TYPES.WEIGHT_REPS,
        isArchived: Boolean(details.exercise?.isArchived),
        usageCount: Number(details.exercise?.usageCount || 0),
      };

      try {
        await saveExercise(exercise);
        await refreshData();
        showNotice("Упражнение сохранено");
        goBack();
      } catch (error) {
        console.error(error);
        showNotice("Не удалось сохранить упражнение", "error");
      }
    },
    [goBack, refreshData, showNotice],
  );

  const handleDeleteExercise = useCallback(async () => {
    const current = stateRef.current;
    const { planView, data } = current;
    const details = buildExerciseEditingData(data, planView.exerciseId);

    if (!details.exercise) {
      return;
    }

    if (!window.confirm("Удалить упражнение?")) {
      return;
    }

    try {
      const result = await deleteExercise(details.exercise.id);
      await refreshData();
      showNotice(result.status === "archived" ? "Упражнение архивировано" : "Упражнение удалено");
      goBack();
    } catch (error) {
      console.error(error);
      showNotice("Не удалось удалить упражнение", "error");
    }
  }, [goBack, refreshData, showNotice]);

  const handleExportData = useCallback(async () => {
    try {
      const snapshot = await exportAppData();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gym-app-data.json";
      link.click();
      URL.revokeObjectURL(url);
      showNotice("Экспорт подготовлен");
    } catch (error) {
      console.error(error);
      showNotice("Не удалось экспортировать данные", "error");
    }
  }, [showNotice]);

  const handleImportData = useCallback(() => {
    showNotice("Импорт данных будет добавлен позже");
  }, [showNotice]);

  const handleClearWorkouts = useCallback(async () => {
    if (!window.confirm("Очистить все завершённые тренировки?")) {
      return;
    }

    try {
      await clearWorkoutLogs();
      await refreshData();
      showNotice("Тренировки очищены");
    } catch (error) {
      console.error(error);
      showNotice("Не удалось очистить тренировки", "error");
    }
  }, [refreshData, showNotice]);

  const activeView = useMemo(() => {
    const screenAnimationMode = screenAnimationModeRef.current;
    const isSecondaryMotion =
      screenAnimationMode === "secondary-open" || screenAnimationMode === "secondary-close";
    const screenTransition = shouldReduceMotion
      ? { duration: 0 }
      : isSecondaryMotion
        ? secondaryScreenTransition
        : {
            damping: 32,
            mass: 0.78,
            stiffness: 360,
            type: "spring",
          };
    const screenInitial = shouldReduceMotion ? false : "initial";
    let screenKey = "loading";
    let screenContent = null;

    if (state.isLoading) {
      screenContent = <LoadingScreen />;
    } else if (state.error) {
      screenKey = "error";
      screenContent = <ErrorScreen message={state.error} />;
    } else if (!state.data) {
      screenKey = "missing-data";
      screenContent = <ErrorScreen message="Данные не найдены" />;
    } else {
      screenKey = getViewScrollKey(state);

      if (state.activeTab === "home") {
        screenContent = (
          <HomeView
            data={state.data}
            homeView={state.homeView}
            activeWorkoutSession={state.activeWorkoutSession}
            onBack={goBack}
            onAddActiveSet={handleAddActiveSet}
            onRemoveActiveSet={handleRemoveActiveSet}
            onActiveSetChange={handleActiveSetChange}
            onOpenExerciseReplacement={openExerciseReplacement}
            onActivePreviousExercise={handleActivePreviousExercise}
            onActiveNextExercise={handleActiveNextExercise}
            onFinishActiveWorkout={handleFinishActiveWorkout}
            onOpenWorkoutPreparation={openWorkoutPreparation}
            onOpenTemplateSelector={openTemplateSelector}
            onStartWorkout={handleStartWorkout}
            onContinueWorkout={handleContinueWorkout}
            onOpenFullWorkout={openJournalWorkout}
          />
        );
      } else if (state.activeTab === "plan") {
        screenContent = (
          <PlanView
            data={state.data}
            planView={state.planView}
            templateDraft={state.templateDraft}
            exerciseDraft={state.exerciseDraft}
            onBack={goBack}
            onOpenTemplateGroup={openTemplateGroup}
            onOpenTemplateCreate={openTemplateCreate}
            onOpenTemplateEdit={openTemplateEdit}
            onOpenExerciseGroup={openExerciseGroup}
            onOpenExerciseCreate={openExerciseCreate}
            onOpenExerciseEdit={openExerciseEdit}
            onTemplateNameChange={handleTemplateNameChange}
            onTemplateDefaultChange={handleTemplateDefaultChange}
            onAddDraftExercise={addDraftExercise}
            onRemoveDraftExercise={removeDraftExercise}
            onTemplateDragStart={handleTemplateDragStart}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onExerciseNameChange={handleExerciseNameChange}
            onSaveExercise={handleSaveExercise}
            onDeleteExercise={handleDeleteExercise}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onClearWorkouts={handleClearWorkouts}
          />
        );
      } else {
        screenContent = (
          <JournalView
            data={state.data}
            journalView={state.journalView}
            onBack={goBack}
            onOpenWorkout={openJournalWorkout}
          />
        );
      }
    }

    return (
      <motion.div
        key={screenKey}
        className="screen-motion-frame"
        custom={screenAnimationMode}
        variants={screenMotionVariants}
        initial={screenInitial}
        animate="animate"
        transition={screenTransition}
      >
        {screenContent}
      </motion.div>
    );
  }, [
    addDraftExercise,
    goBack,
    handleActiveNextExercise,
    handleActivePreviousExercise,
    handleActiveSetChange,
    handleAddActiveSet,
    handleRemoveActiveSet,
    handleClearWorkouts,
    handleDeleteExercise,
    handleDeleteTemplate,
    handleExerciseNameChange,
    handleExportData,
    handleFinishActiveWorkout,
    handleContinueWorkout,
    handleImportData,
    handleSaveExercise,
    handleSaveTemplate,
    handleTemplateDefaultChange,
    handleTemplateDragStart,
    handleTemplateNameChange,
    openExerciseCreate,
    openExerciseEdit,
    openExerciseGroup,
    openExerciseReplacement,
    openJournalWorkout,
    openTemplateCreate,
    openTemplateEdit,
    openTemplateGroup,
    openTemplateSelector,
    openWorkoutPreparation,
    removeDraftExercise,
    handleStartWorkout,
    shouldReduceMotion,
    state.activeTab,
    state.activeWorkoutSession,
    state.data,
    state.error,
    state.exerciseDraft,
    state.homeView,
    state.isLoading,
    state.journalView,
    state.planView,
    state.templateDraft,
  ]);

  return (
    <div id="app" className="app-shell">
      <main id="view" className="view" tabIndex="-1">
        {activeView}
      </main>

      <BottomNav activeTab={state.activeTab} onTabChange={handleTabChange} />

      <InstallButton
        activeTab={state.activeTab}
        canInstall={state.canInstall}
        isStandalone={state.isStandalone}
        onInstall={handleInstallApp}
      />

      <Notice notice={state.notice} />

      <AnimatePresence>
        {state.templateSelector ? (
          <TemplateSelector
            key="template-selector"
            data={state.data}
            selector={state.templateSelector}
            onClose={closeTemplateSelector}
            onSelect={selectWorkoutTemplate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {state.activeExerciseReplacement ? (
          <ActiveExerciseReplacementSheet
            key="exercise-replacement"
            data={state.data}
            selector={state.activeExerciseReplacement}
            session={getActiveWorkoutSessionFromState(state)}
            onClose={closeExerciseReplacement}
            onSelect={selectReplacementExercise}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function updateSelectedExerciseNumbers(list) {
  Array.from(list.querySelectorAll("[data-selected-exercise-item]:not(.is-dragging)")).forEach((item, index) => {
    const node = item.querySelector("[data-selected-exercise-index]");
    if (!node) {
      return;
    }

    node.textContent = String(index + 1);
  });
}

function LoadingScreen() {
  return (
    <section className="screen loading-screen">
      <div className="loader"></div>
      <p>Загружаю данные</p>
    </section>
  );
}

function ErrorScreen({ message }) {
  return (
    <section className="screen">
      <div className="empty-state error-state">
        <h1>Не удалось загрузить приложение</h1>
        <p>{message}</p>
      </div>
    </section>
  );
}

function ScreenTitle({ children, onBack }) {
  return (
    <div className="screen-title-row">
      {onBack ? (
        <button className="back-icon-button" type="button" aria-label="Назад" onClick={onBack}>
          <SvgIcon name="arrowLeft" />
        </button>
      ) : null}
      <h1>{children}</h1>
    </div>
  );
}

function BottomNav({ activeTab, onTabChange }) {
  const shouldReduceMotion = useReducedMotion();
  const indicatorTransition = shouldReduceMotion
    ? { duration: 0 }
    : {
        stiffness: 500,
        damping: 38,
        mass: 0.7,
        type: "spring",
      };

  return (
    <LayoutGroup id="bottom-nav">
      <nav id="bottomNav" className="bottom-nav" aria-label="Основная навигация">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              className={`nav-button${isActive ? " is-active" : ""}`}
              type="button"
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              {isActive ? (
                <motion.span
                  className="nav-active-indicator"
                  layoutId="bottom-nav-active-indicator"
                  transition={indicatorTransition}
                  aria-hidden="true"
                />
              ) : null}
              <span className="nav-icon-layer">
                <SvgIcon name={tab.icon} />
              </span>
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

function InstallButton({ activeTab, canInstall, isStandalone, onInstall }) {
  if (activeTab !== "home" || isStandalone) {
    return null;
  }

  return (
    <button
      className={`install-app-button${canInstall ? " is-ready" : ""}`}
      type="button"
      aria-label="Установить приложение"
      title="Установить приложение"
      onClick={onInstall}
    >
      <SvgIcon name="install" />
    </button>
  );
}

function Notice({ notice }) {
  if (!notice) {
    return null;
  }

  return (
    <div className={`notice notice-${notice.type}`} role="status">
      {notice.message}
    </div>
  );
}

function HomeView({
  data,
  homeView,
  activeWorkoutSession,
  onBack,
  onAddActiveSet,
  onRemoveActiveSet,
  onActiveSetChange,
  onOpenExerciseReplacement,
  onActivePreviousExercise,
  onActiveNextExercise,
  onFinishActiveWorkout,
  onOpenWorkoutPreparation,
  onOpenTemplateSelector,
  onStartWorkout,
  onContinueWorkout,
  onOpenFullWorkout,
}) {
  if (homeView.name === "activeWorkout") {
    const session =
      activeWorkoutSession?.id === homeView.sessionId
        ? activeWorkoutSession
        : data.activeWorkoutSessions?.find((item) => item.id === homeView.sessionId) ?? null;

    return (
      <ActiveWorkoutScreen
        session={session}
        onBack={onBack}
        onAddSet={onAddActiveSet}
        onRemoveSet={onRemoveActiveSet}
        onSetChange={onActiveSetChange}
        onOpenReplacement={onOpenExerciseReplacement}
        onPreviousExercise={onActivePreviousExercise}
        onNextExercise={onActiveNextExercise}
        onFinish={onFinishActiveWorkout}
      />
    );
  }

  if (homeView.name === "preparation") {
    return (
      <WorkoutPreparationScreen
        data={data}
        activeWorkoutSession={activeWorkoutSession}
        workoutGroupId={homeView.workoutGroupId}
        onBack={onBack}
        onOpenTemplateSelector={onOpenTemplateSelector}
        onStartWorkout={onStartWorkout}
        onContinueWorkout={onContinueWorkout}
        onOpenFullWorkout={onOpenFullWorkout}
      />
    );
  }

  const workoutCards = buildWorkoutGroupCards(data);
  return (
    <section className="screen home-screen">
      <header className="screen-header">
        <h1>Главная</h1>
      </header>

      <div className="home-section-title">
        <span>Выбери тренировку для старта</span>
      </div>

      <div className="workout-list home-workout-list">
        {workoutCards.map((card, index) => (
          <WorkoutCard
            key={card.workoutGroup.id}
            card={card}
            illustrationIndex={index + 1}
            imageSrc={WORKOUT_IMAGES[index % WORKOUT_IMAGES.length]}
            onOpen={() => onOpenWorkoutPreparation(card.workoutGroup.id)}
          />
        ))}
      </div>
    </section>
  );
}

function WorkoutCard({ card, illustrationIndex, imageSrc, onOpen }) {
  const nameParts = card.workoutGroup.name.split("+").map((part) => part.trim()).filter(Boolean);
  const lastDoneLabel = formatLastWorkoutLabel(card.lastWorkoutDate);

  return (
    <button className="workout-card workout-card-button" type="button" data-illustration={illustrationIndex} onClick={onOpen}>
      <div className="workout-card-content">
        <div className="workout-card-copy">
          <h2 className={`workout-name-stack${nameParts.length > 1 ? "" : " is-single-name"}`} aria-label={card.workoutGroup.name}>
            {nameParts.length > 1 ? (
              nameParts.map((part) => (
                <span key={part} className="workout-name-line">
                  {part}
                </span>
              ))
            ) : (
              <span className="workout-name-line">{card.workoutGroup.name}</span>
            )}
          </h2>
        </div>
        <span className={`workout-last-label${card.lastWorkoutDate ? "" : " is-empty"}`}>{lastDoneLabel}</span>
      </div>

      {imageSrc ? <img className="workout-card-image" src={imageSrc} alt="" aria-hidden="true" /> : null}
    </button>
  );
}

function WorkoutPreparationScreen({
  data,
  activeWorkoutSession,
  workoutGroupId,
  onBack,
  onOpenTemplateSelector,
  onStartWorkout,
  onContinueWorkout,
  onOpenFullWorkout,
}) {
  const details = buildWorkoutPreparationData(data, workoutGroupId);
  const unfinishedSession = getActiveWorkoutSessionForGroup(
    { data, activeWorkoutSession },
    workoutGroupId,
  );

  if (!details.workoutGroup) {
    return (
      <section className="screen workout-prep-screen">
        <div className="empty-state error-state">
          <ScreenTitle onBack={onBack}>Тренировка не найдена</ScreenTitle>
          <p>Вернись на главную и выбери тренировку ещё раз.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen workout-prep-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>{details.workoutGroup.name}</ScreenTitle>
        <p className="screen-subtitle">Последний раз: {formatRelativeDate(details.lastWorkoutDate)}</p>
      </header>

      <section className="panel plan-section">
        <div className="section-title">
          <span>Шаблоны</span>
        </div>
        <div className="plan-list">
          {details.templateRows.map((plan) => (
            <button
              key={plan.muscleGroup.id}
              className="plan-row prep-template-row prep-template-select"
              type="button"
              onClick={() => onOpenTemplateSelector(plan.muscleGroup.id, details.workoutGroup.id)}
            >
              <span className="prep-template-title">
                <strong>{plan.muscleGroup.name}:</strong>
                <span className={plan.template?.isMissing ? "is-missing" : ""}>{plan.template?.name || "Не выбран"}</span>
              </span>
              <span className="select-chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <div className="prep-workout-actions">
        <button
          className={`action-button${unfinishedSession ? " secondary-action" : ""}`}
          type="button"
          onClick={() => onStartWorkout(details.workoutGroup.id)}
        >
          <span>{unfinishedSession ? "Новая тренировка" : "Начать тренировку"}</span>
        </button>
        {unfinishedSession ? (
          <button className="action-button" type="button" onClick={() => onContinueWorkout(unfinishedSession.id)}>
            <span>Продолжить тренировку</span>
          </button>
        ) : null}
      </div>

      <section className="panel plan-section">
        <div className="section-title">
          <span>План тренировки</span>
        </div>
        <div className="prep-plan-list">
          {details.planSections.map((plan) => (
            <div key={plan.muscleGroup.id} className="prep-plan-group">
              <div className="prep-group-title">
                <strong>{plan.muscleGroup.name}</strong>
              </div>
              {plan.exercises.length ? (
                <ol className="prep-exercise-list">
                  {plan.exercises.map((exercise) => (
                    <li key={exercise.id} className={`prep-exercise-row${exercise.isMissing ? " is-missing" : ""}`}>
                      <strong>{exercise.name}</strong>
                      <span>{formatLastSetResult(exercise.lastSet)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state compact-empty-state">
                  <h2>В шаблоне нет упражнений</h2>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <PreviousWorkoutBlock workout={details.previousWorkout} onOpenFullWorkout={onOpenFullWorkout} />
    </section>
  );
}

function ActiveWorkoutScreen({
  session,
  onBack,
  onAddSet,
  onRemoveSet,
  onSetChange,
  onOpenReplacement,
  onPreviousExercise,
  onNextExercise,
  onFinish,
}) {
  const shouldReduceMotion = useReducedMotion();
  const exerciseLogsLength = session?.exerciseLogs?.length ?? 0;
  const currentIndex = exerciseLogsLength
    ? Math.min(
        Math.max(Number(session.currentExerciseIndex ?? 0), 0),
        exerciseLogsLength - 1,
      )
    : 0;
  const exerciseMotionStateRef = useRef({ index: currentIndex, sessionId: session?.id ?? null });
  const previousExerciseMotionState = exerciseMotionStateRef.current;
  const exerciseMotionMode =
    previousExerciseMotionState.sessionId !== (session?.id ?? null)
      ? "main"
      : currentIndex > previousExerciseMotionState.index
        ? "secondary-open"
        : currentIndex < previousExerciseMotionState.index
          ? "secondary-close"
          : "main";

  useEffect(() => {
    exerciseMotionStateRef.current = {
      index: currentIndex,
      sessionId: session?.id ?? null,
    };
  }, [currentIndex, session?.id]);

  if (!session || !session.exerciseLogs?.length) {
    return (
      <section className="screen active-workout-screen">
        <div className="empty-state error-state">
          <ScreenTitle onBack={onBack}>Активная тренировка не найдена</ScreenTitle>
          <p>Вернись на главную и начни тренировку ещё раз.</p>
        </div>
      </section>
    );
  }

  const exerciseLog = session.exerciseLogs[currentIndex];
  const groupExercises = session.exerciseLogs.filter(
    (item) => item.muscleGroupId === exerciseLog.muscleGroupId,
  );
  const groupExerciseIndex = groupExercises.findIndex((item) => item === exerciseLog);
  const exerciseProgressLabel = `${exerciseLog.muscleGroupNameSnapshot} упражнение ${groupExerciseIndex + 1} из ${groupExercises.length}`;
  const isFirstExercise = currentIndex <= 0;
  const isLastExercise = currentIndex >= session.exerciseLogs.length - 1;
  const sets = exerciseLog.sets?.length ? exerciseLog.sets : [{ setNumber: 1, weightKg: "", reps: "" }];
  const canRemoveSet = sets.length > 1;

  return (
    <section className="screen active-workout-screen">
      <motion.div
        key={`${session.id}-${currentIndex}`}
        className="active-exercise-motion"
        custom={exerciseMotionMode}
        variants={screenMotionVariants}
        initial={shouldReduceMotion || exerciseMotionMode === "main" ? false : "initial"}
        animate="animate"
        transition={shouldReduceMotion ? { duration: 0 } : secondaryScreenTransition}
      >
        <header className="screen-header active-workout-header">
          <ScreenTitle onBack={onBack}>{exerciseProgressLabel}</ScreenTitle>
          <p className="active-exercise-title">
            Упражнение {exerciseLog.exerciseNameSnapshot}
          </p>
          <button
            className="action-button secondary-action active-replace-button"
            type="button"
            onClick={() => onOpenReplacement(currentIndex)}
          >
            <span>Заменить упражнение</span>
          </button>
        </header>

        <section className="panel active-exercise-panel">
          <p className="active-previous-sets">
            <span>Прошлый раз:</span> <strong>{formatSetList(exerciseLog.previousSets)}</strong>
          </p>
        </section>

        <section className="panel plan-section active-sets-panel">
          <div className="active-set-list">
            {sets.map((set, index) => (
              <div
                key={`${exerciseLog.exerciseId}-${set.setNumber ?? index}`}
                className="active-set-row"
              >
                <span className="active-set-number">{index + 1}</span>
                <label className="active-set-input">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={set.weightKg ?? ""}
                    placeholder="0"
                    aria-label={`Вес в подходе ${index + 1}`}
                    onChange={(event) => onSetChange(currentIndex, index, "weightKg", event.target.value)}
                  />
                  <span>кг</span>
                </label>
                <label className="active-set-input">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={set.reps ?? ""}
                    placeholder="0"
                    aria-label={`Повторы в подходе ${index + 1}`}
                    onChange={(event) => onSetChange(currentIndex, index, "reps", event.target.value)}
                  />
                  <span>повт.</span>
                </label>
                <button
                  className="active-set-remove-button"
                  type="button"
                  disabled={!canRemoveSet}
                  aria-label={`Удалить подход ${index + 1}`}
                  onClick={() => onRemoveSet(currentIndex, index)}
                />
              </div>
            ))}
          </div>

          <button className="action-button secondary-action active-add-set-button" type="button" onClick={() => onAddSet(currentIndex)}>
            <span>Добавить подход</span>
          </button>
        </section>
      </motion.div>

      <div className="active-navigation-actions">
        <button className="action-button active-next-button" type="button" onClick={isLastExercise ? onFinish : onNextExercise}>
          <span>{isLastExercise ? "Завершить тренировку" : "Следующее упражнение"}</span>
        </button>
        <button
          className="action-button secondary-action"
          type="button"
          disabled={isFirstExercise}
          onClick={onPreviousExercise}
        >
          <span>Предыдущее упражнение</span>
        </button>
      </div>
    </section>
  );
}

function PreviousWorkoutBlock({ workout, onOpenFullWorkout }) {
  if (!workout) {
    return (
      <section className="panel plan-section">
        <div className="section-title">
          <span>Прошлая тренировка</span>
        </div>
        <div className="empty-state compact-empty-state">
          <h2>Прошлых тренировок нет</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="panel plan-section">
      <div className="section-title">
        <span>Прошлая тренировка</span>
      </div>
      <div className="previous-workout-card">
        <strong className="previous-workout-date">{formatDate(workout.date)}</strong>
        <div className="previous-workout-list">
          {workout.sections.map((muscleLog) => (
            <div key={muscleLog.muscleGroup.id} className="previous-workout-group">
              <strong>
                {muscleLog.muscleGroup.name} {muscleLog.templateName || "Шаблон не указан"}
              </strong>
              <p>{muscleLog.exerciseNames?.join(", ") || "Нет списка упражнений"}</p>
            </div>
          ))}
        </div>
      </div>
      <button className="action-button" type="button" onClick={() => onOpenFullWorkout(workout.id)}>
        <span>Открыть полностью</span>
      </button>
    </section>
  );
}

function PlanView({
  data,
  planView,
  templateDraft,
  exerciseDraft,
  onBack,
  onOpenTemplateGroup,
  onOpenTemplateCreate,
  onOpenTemplateEdit,
  onOpenExerciseGroup,
  onOpenExerciseCreate,
  onOpenExerciseEdit,
  onTemplateNameChange,
  onTemplateDefaultChange,
  onAddDraftExercise,
  onRemoveDraftExercise,
  onTemplateDragStart,
  onSaveTemplate,
  onDeleteTemplate,
  onExerciseNameChange,
  onSaveExercise,
  onDeleteExercise,
  onExportData,
  onImportData,
  onClearWorkouts,
}) {
  if (planView.name === "templates") {
    return (
      <TemplatesScreen
        data={data}
        muscleGroupId={planView.muscleGroupId}
        onBack={onBack}
        onCreate={onOpenTemplateCreate}
        onEdit={onOpenTemplateEdit}
      />
    );
  }

  if (planView.name === "createTemplate" || planView.name === "editTemplate") {
    return (
      <TemplateFormScreen
        data={data}
        planView={planView}
        draft={templateDraft}
        onBack={onBack}
        onNameChange={onTemplateNameChange}
        onDefaultChange={onTemplateDefaultChange}
        onAddExercise={onAddDraftExercise}
        onRemoveExercise={onRemoveDraftExercise}
        onDragStart={onTemplateDragStart}
        onSave={onSaveTemplate}
        onDelete={onDeleteTemplate}
      />
    );
  }

  if (planView.name === "exercises") {
    return (
      <ExercisesScreen
        data={data}
        muscleGroupId={planView.muscleGroupId}
        onBack={onBack}
        onCreate={onOpenExerciseCreate}
        onEdit={onOpenExerciseEdit}
      />
    );
  }

  if (planView.name === "createExercise" || planView.name === "editExercise") {
    return (
      <ExerciseFormScreen
        data={data}
        planView={planView}
        draft={exerciseDraft}
        onBack={onBack}
        onNameChange={onExerciseNameChange}
        onSave={onSaveExercise}
        onDelete={onDeleteExercise}
      />
    );
  }

  return (
    <PlanOverview
      data={data}
      onOpenTemplateGroup={onOpenTemplateGroup}
      onOpenExerciseGroup={onOpenExerciseGroup}
      onExportData={onExportData}
      onImportData={onImportData}
      onClearWorkouts={onClearWorkouts}
    />
  );
}

function PlanOverview({
  data,
  onOpenTemplateGroup,
  onOpenExerciseGroup,
  onExportData,
  onImportData,
  onClearWorkouts,
}) {
  const cycleItems = buildCycleItems(data);
  const templateSummaries = buildTemplateSummariesByMuscleGroup(data);
  const exerciseSummaries = buildExerciseSummariesByMuscleGroup(data);

  return (
    <section className="screen plan-screen">
      <header className="screen-header">
        <h1>План</h1>
      </header>

      <section className="panel plan-section">
        <div className="section-title">
          <span>Тренировочный цикл</span>
          <small>{cycleItems.length} тренировки</small>
        </div>
        <div className="plan-list">
          {cycleItems.map((item) => (
            <div key={item.workoutGroup.id} className="plan-row plan-cycle-row">
              <strong>{item.workoutGroup.name}</strong>
              <ClickIndicator />
            </div>
          ))}
        </div>
      </section>

      <section className="panel plan-section">
        <div className="section-title">
          <span>Шаблоны упражнений</span>
        </div>
        <div className="plan-summary-grid">
          {templateSummaries.map((summary) => (
            <button
              key={summary.muscleGroup.id}
              className="plan-summary-card plan-summary-button"
              type="button"
              onClick={() => onOpenTemplateGroup(summary.muscleGroup.id)}
            >
              <div className="plan-summary-card-copy">
                <strong>{summary.muscleGroup.name}</strong>
                <span>
                  {summary.templateCount} {pluralRu(summary.templateCount, "шаблон", "шаблона", "шаблонов")}
                </span>
              </div>
              <ClickIndicator />
            </button>
          ))}
        </div>
      </section>

      <section className="panel plan-section">
        <div className="section-title">
          <span>База упражнений</span>
        </div>
        <div className="plan-summary-grid">
          {exerciseSummaries.map((summary) => (
            <button
              key={summary.muscleGroup.id}
              className="plan-summary-card plan-summary-button"
              type="button"
              onClick={() => onOpenExerciseGroup(summary.muscleGroup.id)}
            >
              <div className="plan-summary-card-copy">
                <strong>{summary.muscleGroup.name}</strong>
                <span>{summary.exerciseCount} упр.</span>
              </div>
              <ClickIndicator />
            </button>
          ))}
        </div>
      </section>

      <section className="panel plan-section data-section">
        <div className="section-title">
          <span>Данные</span>
        </div>
        <div className="action-grid">
          <button className="action-button" type="button" onClick={onExportData}>
            <SvgIcon name="download" />
            <span>Экспорт данных</span>
          </button>
          <button className="action-button" type="button" disabled title="Будет добавлено позже">
            <SvgIcon name="upload" />
            <span>Импорт данных</span>
          </button>
          <button className="action-button danger-action" type="button" onClick={onClearWorkouts}>
            <SvgIcon name="trash" />
            <span>Очистить тренировки</span>
          </button>
        </div>
      </section>
    </section>
  );
}

function TemplatesScreen({ data, muscleGroupId, onBack, onCreate, onEdit }) {
  const details = buildTemplatesForMuscleGroup(data, muscleGroupId);

  return (
    <section className="screen plan-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>Шаблоны: {details.muscleGroup?.name || "Мышца"}</ScreenTitle>
      </header>

      <div className="template-list">
        {details.templates.length ? (
          details.templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              exercises={template.exercises || []}
              onEdit={() => onEdit(muscleGroupId, template.id)}
            />
          ))
        ) : (
          <div className="empty-state">
            <h2>Пока нет шаблонов</h2>
          </div>
        )}
      </div>

      <button className="action-button create-template-button" type="button" onClick={() => onCreate(muscleGroupId)}>
        <span>Создать шаблон</span>
      </button>
    </section>
  );
}

function TemplateCard({ template, exercises, onEdit }) {
  return (
    <article className="template-card">
      <div className="template-card-topline">
        <h2>{template.name}</h2>
        <EditIconButton label={`Редактировать шаблон ${template.name}`} onClick={onEdit} />
      </div>

      <div className="template-exercise-block">
        <ol className="template-exercise-list">
          {exercises.map((exercise) => (
            <li
              className={`plan-row template-exercise-item${exercise.isMissing ? " is-missing" : ""}`}
              key={`${template.id}-${exercise.id}`}
            >
              {exercise.name}
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function TemplateFormScreen({
  data,
  planView,
  draft,
  onBack,
  onNameChange,
  onDefaultChange,
  onAddExercise,
  onRemoveExercise,
  onDragStart,
  onSave,
  onDelete,
}) {
  const details =
    planView.name === "editTemplate"
      ? buildTemplateEditingData(data, planView.templateId)
      : buildTemplateCreationData(data, planView.muscleGroupId);
  const protectedTemplate = isProtectedTemplate(details.template);
  const isEdit = planView.name === "editTemplate";

  return (
    <section className="screen plan-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>{isEdit ? `Шаблон: ${details.muscleGroup?.name || "Мышца"}` : `Шаблон: ${details.muscleGroup?.name || "Мышца"}`}</ScreenTitle>
      </header>

      <form className="template-form" onSubmit={onSave}>
        <label className="form-field">
          <input
            className="form-input"
            type="text"
            name="templateName"
            value={protectedTemplate ? details.template.name : draft.name}
            placeholder="Название шаблона"
            autoComplete="off"
            onChange={onNameChange}
            readOnly={protectedTemplate}
            aria-readonly={protectedTemplate}
          />
        </label>

        <div className="template-choice-list">
          <label className="plan-row template-choice-row default-template-row">
            <input
              className="template-choice-input"
              type="checkbox"
              name="isDefault"
              value="true"
              checked={draft.isDefault}
              onChange={onDefaultChange}
            />
            <span className="template-choice-box" aria-hidden="true" />
            <span className="template-choice-name">По умолчанию</span>
          </label>
        </div>

        <TemplateExerciseBuilder
          details={details}
          selectedExerciseIds={draft.selectedExerciseIds}
          onAddExercise={onAddExercise}
          onRemoveExercise={onRemoveExercise}
          onDragStart={onDragStart}
        />

        <button className="action-button" type="submit">
          <span>Сохранить шаблон</span>
        </button>

        {isEdit && !protectedTemplate ? (
          <button className="action-button danger-action" type="button" onClick={onDelete}>
            <span>Удалить шаблон</span>
          </button>
        ) : null}
      </form>
    </section>
  );
}

function TemplateExerciseBuilder({ details, selectedExerciseIds, onAddExercise, onRemoveExercise, onDragStart }) {
  const [recentlyAddedExerciseId, setRecentlyAddedExerciseId] = useState(null);
  const [removingExerciseIds, setRemovingExerciseIds] = useState(() => new Set());
  const addAnimationTimerRef = useRef(null);
  const removeAnimationTimersRef = useRef(new Map());
  const selectedSet = new Set(selectedExerciseIds);
  const selectedExercises = selectedExerciseIds.map((exerciseId) => {
    const exercise = details.exercises.find((item) => item.id === exerciseId);
    return exercise || { id: exerciseId, name: "Упражнение не найдено", isMissing: true };
  });

  useEffect(() => {
    return () => {
      window.clearTimeout(addAnimationTimerRef.current);
      removeAnimationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      removeAnimationTimersRef.current.clear();
    };
  }, []);

  const runAddExercise = useCallback(
    (exerciseId) => {
      window.clearTimeout(addAnimationTimerRef.current);
      setRecentlyAddedExerciseId(exerciseId);
      addAnimationTimerRef.current = window.setTimeout(() => {
        setRecentlyAddedExerciseId(null);
      }, TEMPLATE_EXERCISE_ANIMATION_MS);
      onAddExercise(exerciseId);
    },
    [onAddExercise],
  );

  const runRemoveExercise = useCallback(
    (exerciseId) => {
      if (removeAnimationTimersRef.current.has(exerciseId)) {
        return;
      }

      setRemovingExerciseIds((current) => {
        const next = new Set(current);
        next.add(exerciseId);
        return next;
      });

      const timerId = window.setTimeout(() => {
        onRemoveExercise(exerciseId);
        removeAnimationTimersRef.current.delete(exerciseId);
        setRemovingExerciseIds((current) => {
          const next = new Set(current);
          next.delete(exerciseId);
          return next;
        });
      }, TEMPLATE_EXERCISE_ANIMATION_MS);

      removeAnimationTimersRef.current.set(exerciseId, timerId);
    },
    [onRemoveExercise],
  );

  return (
    <>
      <section className="panel plan-section template-builder-section">
        <div className="section-title">
          <span>Выбранные упражнения</span>
        </div>
        <div className="template-builder-scroll" data-selected-exercise-list>
          {selectedExercises.length ? (
            selectedExercises.map((exercise, index) => {
              const isEntering = recentlyAddedExerciseId === exercise.id;
              const isRemoving = removingExerciseIds.has(exercise.id);

              return (
                <div
                  key={`${exercise.id}-${index}`}
                  className={`plan-row template-selected-item${exercise.isMissing ? " is-missing" : ""}${isEntering ? " is-entering" : ""}${isRemoving ? " is-removing" : ""}`}
                  data-selected-exercise-item
                  data-selected-exercise-id={exercise.id}
                  data-exercise-id={exercise.id}
                >
                  <input type="hidden" name="exerciseIds" value={exercise.id} data-selected-exercise-input />
                  <button
                    className="template-drag-handle"
                    type="button"
                    data-template-drag-handle
                    aria-label={`Перетащить упражнение ${exercise.name}`}
                    onPointerDown={onDragStart}
                  >
                    <span className="template-drag-grip" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  </button>
                  <span className="template-selected-number" data-selected-exercise-index data-selected-exercise-number>
                    {index + 1}
                  </span>
                  <span className="template-selected-name">{exercise.name}</span>
                  <button
                    className="template-remove-button"
                    type="button"
                    data-action="remove-template-exercise"
                    data-exercise-id={exercise.id}
                    aria-label={`Убрать ${exercise.name}`}
                    onClick={() => runRemoveExercise(exercise.id)}
                  />
                </div>
              );
            })
          ) : (
            <div className="template-builder-empty">Выбери упражнения ниже</div>
          )}
        </div>
      </section>

      <section className="panel plan-section template-builder-section">
        <div className="section-title">
          <span>База упражнений</span>
        </div>
        <div className="template-builder-scroll">
          <div className="template-base-list">
            {details.exercises.length ? (
              details.exercises.map((exercise) => {
                const isSelected = selectedSet.has(exercise.id);
                const isRemoving = removingExerciseIds.has(exercise.id);
                const isBaseSelected = isSelected && !isRemoving;

                return (
                  <button
                    key={exercise.id}
                    className={`plan-row template-base-exercise-button${isBaseSelected ? " is-selected" : ""}`}
                    type="button"
                    aria-pressed={isBaseSelected}
                    onClick={() => (isSelected ? runRemoveExercise(exercise.id) : runAddExercise(exercise.id))}
                  >
                    <span className="template-choice-name">{exercise.name}</span>
                    <span className={`template-base-status${isBaseSelected ? " is-visible" : ""}`}>Выбрано</span>
                  </button>
                );
              })
            ) : (
              <div className="template-builder-empty">В базе пока нет упражнений</div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ExercisesScreen({ data, muscleGroupId, onBack, onCreate, onEdit }) {
  const details = buildExercisesForMuscleGroup(data, muscleGroupId);

  return (
    <section className="screen plan-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>База: {details.muscleGroup?.name || "Мышца"}</ScreenTitle>
      </header>

      <div className="template-list">
        {details.exercises.length ? (
          details.exercises.map((exercise) => (
            <article key={exercise.id} className="template-card">
              <div className="template-card-topline">
                <h2>{exercise.name}</h2>
                <EditIconButton
                  label={`Редактировать упражнение ${exercise.name}`}
                  onClick={() => onEdit(muscleGroupId, exercise.id)}
                />
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h2>Пока нет упражнений</h2>
          </div>
        )}
      </div>

      <button className="action-button create-template-button" type="button" onClick={() => onCreate(muscleGroupId)}>
        <span>Добавить упражнение</span>
      </button>
    </section>
  );
}

function ExerciseFormScreen({ data, planView, draft, onBack, onNameChange, onSave, onDelete }) {
  const details =
    planView.name === "editExercise"
      ? buildExerciseEditingData(data, planView.exerciseId)
      : buildExerciseCreationData(data, planView.muscleGroupId);
  const isEdit = planView.name === "editExercise";

  return (
    <section className="screen plan-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>{isEdit ? "Редактировать упражнение" : `Новая запись: ${details.muscleGroup?.name || "Мышца"}`}</ScreenTitle>
      </header>

      <form className="template-form" onSubmit={onSave}>
        <label className="form-field">
          <input
            className="form-input"
            type="text"
            name="exerciseName"
            value={draft.name}
            placeholder="Название упражнения"
            autoComplete="off"
            onChange={onNameChange}
          />
        </label>

        <button className="action-button" type="submit">
          <span>Сохранить упражнение</span>
        </button>

        {isEdit ? (
          <button className="action-button danger-action" type="button" onClick={onDelete}>
            <span>Удалить упражнение</span>
          </button>
        ) : null}
      </form>
    </section>
  );
}

function JournalView({ data, journalView, onBack, onOpenWorkout }) {
  if (journalView.name === "details") {
    return (
      <JournalWorkoutDetails
        data={data}
        workoutLogId={journalView.workoutLogId}
        onBack={onBack}
      />
    );
  }

  const entries = buildJournalEntries(data);

  return (
    <section className="screen journal-screen">
      <header className="screen-header">
        <h1>Журнал</h1>
      </header>

      {entries.length ? (
        <div className="journal-list">
          {entries.map((entry) => {
            const dateParts = getJournalDateParts(entry.date);

            return (
              <button
                key={entry.id}
                className="journal-card"
                type="button"
                onClick={() => onOpenWorkout(entry.id)}
              >
                <div className="journal-card-header">
                  <div className="journal-card-date" aria-label={formatJournalDate(entry.date)}>
                    <strong>{dateParts.day}</strong>
                    <span>{dateParts.month}</span>
                  </div>

                  <div className="journal-card-title">
                    <h2>{entry.name}</h2>
                  </div>

                  <span className="journal-card-chevron" aria-hidden="true" />
                </div>

                <div className="journal-card-groups">
                  {entry.sections.map((section) => (
                    <div key={section.muscleGroup.id} className="journal-card-group">
                      <strong>
                        {section.muscleGroup.name}
                        {section.templateName && section.templateName !== "Шаблон не указан" ? (
                          <span className="journal-card-template">: {section.templateName}</span>
                        ) : null}
                      </strong>
                      <p>
                        {section.exercises.map((exercise) => exercise.name).join(" · ") ||
                          "Нет списка упражнений"}
                      </p>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-state compact-empty-state journal-empty-state">
          <SvgIcon name="journal" />
          <h2>Пока нет завершённых тренировок</h2>
          <p>После завершения тренировки записи появятся здесь.</p>
        </div>
      )}
    </section>
  );
}

function JournalWorkoutDetails({ data, workoutLogId, onBack }) {
  const details = buildJournalWorkoutDetails(data, workoutLogId);

  if (!details) {
    return (
      <section className="screen journal-detail-screen">
        <div className="empty-state error-state">
          <ScreenTitle onBack={onBack}>Запись не найдена</ScreenTitle>
          <p>Вернись в журнал и выбери тренировку ещё раз.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen journal-detail-screen">
      <header className="screen-header">
        <ScreenTitle onBack={onBack}>{details.name}</ScreenTitle>
        <p className="screen-subtitle">{formatJournalDate(details.date)}</p>
      </header>

      {details.sections.map((section) => (
        <section key={section.muscleGroup.id} className="journal-detail-group">
          <div className="journal-muscle-header">
            <h2>{section.muscleGroup.name}</h2>
            <span className="journal-section-template">
              Шаблон: {section.templateName || "не указан"}
            </span>
          </div>

          <div className="journal-exercise-list">
            {section.exercises.map((exercise, exerciseIndex) => (
              <article key={`${exercise.id}-${exerciseIndex}`} className="journal-exercise-card">
                <h2>
                  <span>{exercise.name}</span>
                  {exercise.isReplacement ? (
                    <>
                      <span className="journal-replacement-divider">|</span>
                      <span className="journal-replacement-note">вместо: {exercise.plannedName}</span>
                    </>
                  ) : null}
                </h2>

                {exercise.sets.length ? (
                  <ol className="journal-set-list">
                    {exercise.sets.map((set, setIndex) => (
                      <li key={`${exercise.id}-${setIndex}`}>
                        <span>{set.setNumber ?? setIndex + 1} подход</span>
                        <strong>{formatWorkoutSet(set)}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="journal-empty-sets">Подходы не записаны</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function TemplateSelector({ data, selector, onClose, onSelect }) {
  const shouldReduceMotion = useReducedMotion();

  if (!data || !selector) {
    return null;
  }

  const details = buildTemplatesForMuscleGroup(data, selector.muscleGroupId);
  const workoutGroup = data.workoutGroups.find((group) => group.id === selector.workoutGroupId);
  const selectedTemplateId = workoutGroup
    ? getSelectedTemplateIdForMuscleGroup(data, workoutGroup, selector.muscleGroupId)
    : null;

  return (
    <motion.div
      className="template-select-layer"
      role="presentation"
    >
      <motion.button
        className="template-select-backdrop"
        type="button"
        aria-label="Закрыть выбор шаблона"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : bottomSheetBackdropTransition}
        onClick={onClose}
      />
      <motion.section
        className="template-select-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Выбор шаблона"
        initial={shouldReduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={shouldReduceMotion ? undefined : { y: "100%" }}
        transition={shouldReduceMotion ? { duration: 0 } : bottomSheetTransition}
      >
        <div className="template-select-handle" aria-hidden="true" />
        <div className="template-select-list">
          {details.templates.length ? (
            details.templates.map((template) => (
              <button
                key={template.id}
                className={`template-select-option${template.id === selectedTemplateId ? " is-selected" : ""}`}
                type="button"
                onClick={() => onSelect(template.id)}
              >
                <span>{template.name}</span>
                {template.id === selectedTemplateId ? <span className="template-select-check" aria-hidden="true">✓</span> : null}
              </button>
            ))
          ) : (
            <div className="empty-state compact-empty-state">
              <h2>Шаблонов ещё нет</h2>
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

function ActiveExerciseReplacementSheet({ data, selector, session, onClose, onSelect }) {
  const shouldReduceMotion = useReducedMotion();

  if (!data || !selector || !session) {
    return null;
  }

  const exerciseLog = session.exerciseLogs?.[selector.exerciseIndex];

  if (!exerciseLog) {
    return null;
  }

  const templateSnapshot = session.templateSnapshots?.find(
    (template) => template.muscleGroupId === exerciseLog.muscleGroupId,
  );
  const plannedExerciseIds = new Set(templateSnapshot?.exerciseIds ?? []);
  const plannedExerciseId = exerciseLog.plannedExerciseId ?? exerciseLog.exerciseId;
  const usedExerciseIds = new Set(
    session.exerciseLogs
      .filter((_, currentExerciseIndex) => currentExerciseIndex !== selector.exerciseIndex)
      .map((item) => item.exerciseId)
      .filter(Boolean),
  );
  const exercises = data.exercises
    .filter((exercise) => exercise.muscleGroupId === exerciseLog.muscleGroupId && !exercise.isArchived)
    .map((exercise) => ({
      ...exercise,
      isCurrent: exercise.id === exerciseLog.exerciseId,
      isInPlan: plannedExerciseIds.has(exercise.id),
      isPlannedForCurrentSlot: exercise.id === plannedExerciseId,
      isUsedInWorkout: usedExerciseIds.has(exercise.id),
    }));

  return (
    <motion.div
      className="template-select-layer"
      role="presentation"
    >
      <motion.button
        className="template-select-backdrop"
        type="button"
        aria-label="Закрыть выбор упражнения"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : bottomSheetBackdropTransition}
        onClick={onClose}
      />
      <motion.section
        className="template-select-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Замена упражнения"
        initial={shouldReduceMotion ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={shouldReduceMotion ? undefined : { y: "100%" }}
        transition={shouldReduceMotion ? { duration: 0 } : bottomSheetTransition}
      >
        <div className="template-select-handle" aria-hidden="true" />
        <div className="template-select-list">
          {exercises.length ? (
            exercises.map((exercise) => {
              const isDisabled = exercise.isCurrent || exercise.isUsedInWorkout;
              const status = exercise.isCurrent
                ? "Текущее"
                : exercise.isUsedInWorkout
                  ? exercise.isInPlan
                    ? "В плане"
                    : "Уже выбрано"
                  : exercise.isInPlan
                    ? "По плану"
                    : null;

              return (
                <button
                  key={exercise.id}
                  className={`template-select-option${exercise.isCurrent ? " is-selected" : ""}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onSelect(exercise.id)}
                >
                  <span>{exercise.name}</span>
                  {status ? <span className="template-select-check">{status}</span> : null}
                </button>
              );
            })
          ) : (
            <div className="empty-state compact-empty-state">
              <h2>В базе нет упражнений</h2>
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

export default App;
