import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearWorkoutLogs,
  deleteExercise,
  deleteExerciseTemplate,
  exportAppData,
  loadAppData,
  saveExercise,
  saveExerciseTemplate,
  saveWorkoutGroupSelectedTemplate,
} from "./data/storage.js";
import { TRACKING_TYPES } from "./data/seed.js";
import {
  buildCycleItems,
  buildExerciseCreationData,
  buildExerciseEditingData,
  buildExerciseSummariesByMuscleGroup,
  buildExercisesForMuscleGroup,
  buildTemplateCreationData,
  buildTemplateEditingData,
  buildTemplateSummariesByMuscleGroup,
  buildTemplatesForMuscleGroup,
  buildWorkoutGroupCards,
  buildWorkoutPreparationData,
  getCycleProgress,
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

function createInitialState() {
  return {
    activeTab: "home",
    canInstall: false,
    data: null,
    error: null,
    exerciseDraft: { name: "" },
    homeView: { name: "overview", workoutGroupId: null },
    isLoading: true,
    isStandalone:
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true,
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

function createHistoryEntry(state) {
  return {
    tag: HISTORY_TAG,
    activeTab: state.activeTab,
    homeView: normalizeHomeView(state.homeView),
    planView: normalizePlanView(state.planView),
  };
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

function getPlanScrollKey(planView) {
  const normalized = normalizePlanView(planView);
  return [
    "plan",
    normalized.name,
    normalized.muscleGroupId || "",
    normalized.templateId || "",
    normalized.exerciseId || "",
  ].join(":");
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

function positionTemplateDragItem(drag, clientX, clientY) {
  drag.item.style.left = `${clientX - drag.offsetX}px`;
  drag.item.style.top = `${clientY - drag.offsetY}px`;
}

function moveTemplateDragPlaceholder(drag, clientY) {
  const items = Array.from(drag.list.querySelectorAll("[data-selected-exercise-item]:not(.is-dragging)"));
  const nextItem = items.find((item) => {
    const rect = item.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });

  if (nextItem) {
    drag.list.insertBefore(drag.placeholder, nextItem);
  } else {
    drag.list.appendChild(drag.placeholder);
  }

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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback((patchOrUpdater) => {
    setState((current) => {
      const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(current) : patchOrUpdater;
      return { ...current, ...patch };
    });
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
    const current = stateRef.current;
    if (current.activeTab !== "plan") {
      return;
    }

    const viewElement = getViewElement();
    if (!viewElement) {
      return;
    }

    scrollPositionsRef.current.set(getPlanScrollKey(current.planView), viewElement.scrollTop);
  }, []);

  const restoreScrollPosition = useCallback((planView) => {
    requestAnimationFrame(() => {
      const viewElement = getViewElement();
      if (!viewElement) {
        return;
      }

      const key = getPlanScrollKey(planView);
      const savedTop = scrollPositionsRef.current.get(key);
      viewElement.scrollTo({ top: Number.isFinite(savedTop) ? savedTop : 0 });
    });
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
      const next = {
        ...current,
        ...patch,
        homeView: patch.homeView ? normalizeHomeView(patch.homeView) : current.homeView,
        planView: patch.planView ? normalizePlanView(patch.planView) : current.planView,
      };

      if (current.activeTab === "plan" && history === "push") {
        saveCurrentScrollPosition();
      }

      setState(next);

      requestAnimationFrame(() => {
        if (scroll === "restore" && next.activeTab === "plan") {
          restoreScrollPosition(next.planView);
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
    if (current.activeTab === "home" && current.homeView.name !== "overview") {
      navigate({ homeView: { name: "overview" } }, { history: "replace" });
      return;
    }

    if (window.history.state?.tag === HISTORY_TAG) {
      window.history.back();
      return;
    }

    if (current.activeTab === "plan" && current.planView.name !== "overview") {
      navigate({ planView: { name: "overview" } }, { history: "replace" });
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

      setState((current) => ({
        ...current,
        activeTab: entry.activeTab || "home",
        homeView: normalizeHomeView(entry.homeView),
        planView: normalizePlanView(entry.planView),
        templateSelector: null,
      }));

      if (entry.activeTab === "plan") {
        restoreScrollPosition(entry.planView);
      } else {
        requestAnimationFrame(() => getViewElement()?.scrollTo({ top: 0 }));
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [restoreScrollPosition, writeHistoryState]);

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
      }

      const hasOpenNestedView = current.homeView.name !== "overview" || current.planView.name !== "overview";
      navigate(nextPatch, { history: hasOpenNestedView ? "replace" : "push", scroll: "top" });
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

  const startWorkoutPlaceholder = useCallback(() => {
    showNotice("Экран тренировки будет на следующем этапе");
  }, [showNotice]);

  const openFullWorkoutPlaceholder = useCallback(() => {
    showNotice("Полная запись появится в журнале позже");
  }, [showNotice]);

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
    if (state.isLoading) {
      return <LoadingScreen />;
    }

    if (state.error) {
      return <ErrorScreen message={state.error} />;
    }

    if (!state.data) {
      return <ErrorScreen message="Данные не найдены" />;
    }

    return (
      <>
        <div className="tab-view" hidden={state.activeTab !== "home"}>
          <HomeView
            data={state.data}
            homeView={state.homeView}
            onBack={goBack}
            onOpenWorkoutPreparation={openWorkoutPreparation}
            onOpenTemplateSelector={openTemplateSelector}
            onStartWorkout={startWorkoutPlaceholder}
            onOpenFullWorkout={openFullWorkoutPlaceholder}
          />
        </div>

        <div className="tab-view" hidden={state.activeTab !== "plan"}>
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
        </div>

        <div className="tab-view" hidden={state.activeTab !== "journal"}>
          <JournalView data={state.data} />
        </div>
      </>
    );
  }, [
    addDraftExercise,
    goBack,
    handleClearWorkouts,
    handleDeleteExercise,
    handleDeleteTemplate,
    handleExerciseNameChange,
    handleExportData,
    handleImportData,
    handleSaveExercise,
    handleSaveTemplate,
    handleTemplateDefaultChange,
    handleTemplateDragStart,
    handleTemplateNameChange,
    openExerciseCreate,
    openExerciseEdit,
    openExerciseGroup,
    openFullWorkoutPlaceholder,
    openTemplateCreate,
    openTemplateEdit,
    openTemplateGroup,
    openTemplateSelector,
    openWorkoutPreparation,
    removeDraftExercise,
    startWorkoutPlaceholder,
    state.activeTab,
    state.data,
    state.error,
    state.exerciseDraft,
    state.homeView,
    state.isLoading,
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

      <TemplateSelector
        data={state.data}
        selector={state.templateSelector}
        onClose={closeTemplateSelector}
        onSelect={selectWorkoutTemplate}
      />
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

function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav id="bottomNav" className="bottom-nav" aria-label="Основная навигация">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`nav-button${activeTab === tab.id ? " is-active" : ""}`}
          type="button"
          aria-label={tab.label}
          onClick={() => onTabChange(tab.id)}
        >
          <SvgIcon name={tab.icon} />
        </button>
      ))}
    </nav>
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
  onBack,
  onOpenWorkoutPreparation,
  onOpenTemplateSelector,
  onStartWorkout,
  onOpenFullWorkout,
}) {
  if (homeView.name === "preparation") {
    return (
      <WorkoutPreparationScreen
        data={data}
        workoutGroupId={homeView.workoutGroupId}
        onBack={onBack}
        onOpenTemplateSelector={onOpenTemplateSelector}
        onStartWorkout={onStartWorkout}
        onOpenFullWorkout={onOpenFullWorkout}
      />
    );
  }

  const workoutCards = buildWorkoutGroupCards(data);
  const progress = getCycleProgress(data);
  const completedPercent =
    progress.totalCount > 0 ? Math.round((progress.completedCount / progress.totalCount) * 100) : 0;

  return (
    <section className="screen home-screen">
      <header className="screen-header">
        <h1>Главная</h1>
      </header>

      <section className="cycle-summary">
        <div className="cycle-summary-main">
          <div>
            <span className="summary-label">Тренировочный цикл</span>
            <strong>
              {progress.completedCount} из {progress.totalCount} выполнено
            </strong>
          </div>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Прогресс тренировочного цикла"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={completedPercent}
        >
          <span style={{ width: `${completedPercent}%` }}></span>
        </div>
      </section>

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
  workoutGroupId,
  onBack,
  onOpenTemplateSelector,
  onStartWorkout,
  onOpenFullWorkout,
}) {
  const details = buildWorkoutPreparationData(data, workoutGroupId);

  if (!details.workoutGroup) {
    return (
      <section className="screen workout-prep-screen">
        <ScreenBackButton onBack={onBack} />
        <div className="empty-state error-state">
          <h1>Тренировка не найдена</h1>
          <p>Вернись на главную и выбери тренировку ещё раз.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen workout-prep-screen">
      <ScreenBackButton onBack={onBack} />
      <header className="screen-header">
        <h1>{details.workoutGroup.name}</h1>
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

      <button className="action-button" type="button" onClick={onStartWorkout}>
        <span>Начать тренировку</span>
      </button>

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

function PreviousWorkoutBlock({ workout, onOpenFullWorkout }) {
  if (!workout) {
    return (
      <section className="panel plan-section">
        <div className="section-title">
          <span>Прошлая тренировка</span>
        </div>
        <div className="empty-state compact-empty-state">
          <h2>Прошлых тренировок ещё нет</h2>
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
        <span className="previous-workout-label">Шаблоны</span>
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
      <button className="action-button" type="button" onClick={onOpenFullWorkout}>
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
        <p className="screen-subtitle">Настройка тренировок, шаблонов и упражнений</p>
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
      <ScreenBackButton onBack={onBack} />
      <header className="screen-header">
        <h1>Шаблоны: {details.muscleGroup?.name || "Мышца"}</h1>
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
      <ScreenBackButton onBack={onBack} />
      <header className="screen-header">
        <h1>{isEdit ? `Шаблон: ${details.muscleGroup?.name || "Мышца"}` : `Шаблон: ${details.muscleGroup?.name || "Мышца"}`}</h1>
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
  const selectedSet = new Set(selectedExerciseIds);
  const selectedExercises = selectedExerciseIds.map((exerciseId) => {
    const exercise = details.exercises.find((item) => item.id === exerciseId);
    return exercise || { id: exerciseId, name: "Упражнение не найдено", isMissing: true };
  });

  return (
    <>
      <section className="panel plan-section template-builder-section">
        <div className="section-title">
          <span>Выбранные упражнения</span>
        </div>
        <div className="template-builder-scroll" data-selected-exercise-list>
          {selectedExercises.length ? (
            selectedExercises.map((exercise, index) => (
              <div
                key={`${exercise.id}-${index}`}
                className={`plan-row template-selected-item${exercise.isMissing ? " is-missing" : ""}`}
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
                  onClick={() => onRemoveExercise(exercise.id)}
                />
              </div>
            ))
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
                return (
                  <button
                    key={exercise.id}
                    className={`plan-row template-base-exercise-button${isSelected ? " is-selected" : ""}`}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => (isSelected ? onRemoveExercise(exercise.id) : onAddExercise(exercise.id))}
                  >
                    <span className="template-choice-name">{exercise.name}</span>
                    {isSelected ? <span className="template-base-status">Выбрано</span> : null}
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
      <ScreenBackButton onBack={onBack} />
      <header className="screen-header">
        <h1>База: {details.muscleGroup?.name || "Мышца"}</h1>
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
      <ScreenBackButton onBack={onBack} />
      <header className="screen-header">
        <h1>{isEdit ? "Редактировать упражнение" : `Новая запись: ${details.muscleGroup?.name || "Мышца"}`}</h1>
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

function JournalView({ data }) {
  const logs = [...(data.workoutLogs || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <section className="screen">
      <header className="screen-header">
        <h1>Журнал</h1>
      </header>

      {logs.length ? (
        <div className="workout-list">
          {logs.map((log) => (
            <article key={log.id} className="workout-card">
              <div className="card-topline">
                <h2>{log.workoutGroupSnapshot?.name || "Тренировка"}</h2>
                <span className="muted">{formatDate(log.date)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <SvgIcon name="journal" />
          <h2>Пока нет завершённых тренировок</h2>
        </div>
      )}
    </section>
  );
}

function ScreenBackButton({ onBack }) {
  return (
    <button className="back-button" type="button" onClick={onBack}>
      Назад
    </button>
  );
}

function TemplateSelector({ data, selector, onClose, onSelect }) {
  if (!data || !selector) {
    return null;
  }

  const details = buildTemplatesForMuscleGroup(data, selector.muscleGroupId);
  const workoutGroup = data.workoutGroups.find((group) => group.id === selector.workoutGroupId);
  const selectedTemplateId = workoutGroup?.selectedTemplateByMuscleGroupId?.[selector.muscleGroupId];

  return (
    <div className="template-select-layer" role="presentation">
      <button className="template-select-backdrop" type="button" aria-label="Закрыть выбор шаблона" onClick={onClose} />
      <section className="template-select-sheet" role="dialog" aria-modal="true" aria-label="Выбор шаблона">
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
      </section>
    </div>
  );
}

export default App;
