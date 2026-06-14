import { isProtectedTemplate } from "./templateRules.js";

export const FREE_WORKOUT_GROUP_ID = "free-full-body";
export const FREE_WORKOUT_NAME = "Свой план";

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function getDefaultCycle(data) {
  return data.workoutCycles.find((cycle) => cycle.id === "cycle-default") ?? data.workoutCycles[0];
}

function getWorkoutLogGroupId(log) {
  return (
    log.workoutGroupId ??
    log.workoutGroupSnapshot?.id ??
    log.workoutGroupSnapshot?.workoutGroupId ??
    null
  );
}

function isWorkoutLogForGroup(log, workoutGroup) {
  const logGroupId = getWorkoutLogGroupId(log);

  if (logGroupId) {
    return logGroupId === workoutGroup.id;
  }

  return log.workoutGroupSnapshot?.name === workoutGroup.name;
}

function getWorkoutLogDate(log) {
  const date = new Date(log.date);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getLastWorkoutDateForGroup(data, workoutGroup) {
  return data.workoutLogs
    .filter((log) => isWorkoutLogForGroup(log, workoutGroup))
    .map(getWorkoutLogDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function getWorkoutLogsForGroup(data, workoutGroup) {
  return data.workoutLogs
    .filter((log) => isWorkoutLogForGroup(log, workoutGroup))
    .map((log) => ({
      log,
      date: getWorkoutLogDate(log),
    }))
    .filter((item) => item.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function collectExerciseLogEntries(value) {
  const entries = [];

  function walk(item) {
    if (!item || typeof item !== "object") {
      return;
    }

    if (Array.isArray(item)) {
      for (const child of item) {
        walk(child);
      }

      return;
    }

    if (item.exerciseId && Array.isArray(item.sets)) {
      entries.push(item);
    }

    for (const child of Object.values(item)) {
      walk(child);
    }
  }

  walk(value);
  return entries;
}

export function getLastSetsForExercise(data, exerciseId) {
  const logsByDate = data.workoutLogs
    .map((log) => ({
      log,
      date: getWorkoutLogDate(log),
    }))
    .filter((item) => item.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  for (const { log } of logsByDate) {
    const exerciseLog = collectExerciseLogEntries(log).find(
      (entry) => entry.exerciseId === exerciseId,
    );
    const sets = exerciseLog?.sets?.filter(
      (set) =>
        set &&
        set.weightKg !== undefined &&
        set.weightKg !== null &&
        set.reps !== undefined &&
        set.reps !== null,
    );

    if (sets?.length) {
      return sets.map((set, index) => ({
        setNumber: index + 1,
        weightKg: set.weightKg,
        reps: set.reps,
      }));
    }
  }

  return [];
}

function getTemplateSnapshots(log) {
  if (Array.isArray(log.templateSnapshots)) {
    return log.templateSnapshots;
  }

  if (log.templateSnapshots && typeof log.templateSnapshots === "object") {
    return Object.values(log.templateSnapshots);
  }

  return [];
}

function getTemplateSnapshotForMuscleGroup(log, muscleGroupId) {
  return getTemplateSnapshots(log).find(
    (snapshot) =>
      snapshot?.muscleGroupId === muscleGroupId || snapshot?.muscleGroup?.id === muscleGroupId,
  );
}

function getMuscleGroupLogForMuscleGroup(log, muscleGroupId) {
  return (log.muscleGroupLogs ?? []).find(
    (muscleLog) =>
      muscleLog?.muscleGroupId === muscleGroupId || muscleLog?.muscleGroup?.id === muscleGroupId,
  ) ?? null;
}

function dedupeExerciseLogEntries(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const key = [
      entry.muscleGroupId ?? "",
      entry.plannedExerciseId ?? "",
      entry.exerciseId ?? "",
      entry.exerciseNameSnapshot ?? entry.exerciseName ?? entry.name ?? "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function getExerciseLogEntriesForMuscleGroup(log, muscleGroupId) {
  const muscleGroupLog = getMuscleGroupLogForMuscleGroup(log, muscleGroupId);

  if (Array.isArray(muscleGroupLog?.exerciseLogs)) {
    return dedupeExerciseLogEntries(muscleGroupLog.exerciseLogs);
  }

  if (Array.isArray(log.exerciseLogs)) {
    return dedupeExerciseLogEntries(
      log.exerciseLogs.filter((entry) => entry?.muscleGroupId === muscleGroupId),
    );
  }

  return dedupeExerciseLogEntries(
    collectExerciseLogEntries(log).filter((entry) => entry.muscleGroupId === muscleGroupId),
  );
}

function getExerciseNamesFromSnapshot(snapshot) {
  if (!snapshot) {
    return [];
  }

  if (Array.isArray(snapshot.exerciseNames)) {
    return snapshot.exerciseNames.filter(Boolean);
  }

  if (Array.isArray(snapshot.exercises)) {
    return snapshot.exercises
      .map((exercise) =>
        typeof exercise === "string"
          ? exercise
          : exercise?.name ?? exercise?.exerciseNameSnapshot ?? exercise?.exerciseName,
      )
      .filter(Boolean);
  }

  return [];
}

function getWorkoutLogName(data, log) {
  const workoutGroupsById = indexById(data.workoutGroups ?? []);
  const workoutGroupId = getWorkoutLogGroupId(log);

  return (
    log.workoutGroupSnapshot?.name ??
    log.workoutGroupNameSnapshot ??
    (workoutGroupId ? workoutGroupsById.get(workoutGroupId)?.name : null) ??
    "Тренировка"
  );
}

function getMuscleGroupSnapshot(log, muscleGroupId) {
  return (log.muscleGroupSnapshots ?? []).find(
    (snapshot) => snapshot?.id === muscleGroupId || snapshot?.muscleGroupId === muscleGroupId,
  ) ?? null;
}

function getExerciseSnapshotName(snapshotExercise) {
  if (typeof snapshotExercise === "string") {
    return snapshotExercise;
  }

  return (
    snapshotExercise?.name ??
    snapshotExercise?.exerciseNameSnapshot ??
    snapshotExercise?.exerciseName ??
    null
  );
}

function getJournalTemplateId(log, muscleGroupId, source = {}) {
  const templateSnapshot = muscleGroupId
    ? getTemplateSnapshotForMuscleGroup(log, muscleGroupId)
    : null;

  return (
    source.templateId ??
    source.exerciseTemplateId ??
    source.template?.id ??
    templateSnapshot?.id ??
    templateSnapshot?.templateId ??
    null
  );
}

function getJournalSectionFallbacks(data, log, muscleGroupId, source = {}) {
  const muscleGroupsById = indexById(data.muscleGroups ?? []);
  const templatesById = indexById(data.exerciseTemplates ?? []);
  const templateSnapshot = muscleGroupId ? getTemplateSnapshotForMuscleGroup(log, muscleGroupId) : null;
  const muscleGroupSnapshot = muscleGroupId ? getMuscleGroupSnapshot(log, muscleGroupId) : null;
  const currentMuscleGroup = muscleGroupId ? muscleGroupsById.get(muscleGroupId) : null;
  const templateId = getJournalTemplateId(log, muscleGroupId, source);
  const currentTemplate = templateId ? templatesById.get(templateId) : null;

  return {
    templateId,
    muscleGroupName:
      source.muscleGroupNameSnapshot ??
      source.muscleGroup?.name ??
      templateSnapshot?.muscleGroupNameSnapshot ??
      templateSnapshot?.muscleGroup?.name ??
      muscleGroupSnapshot?.name ??
      currentMuscleGroup?.name ??
      "Мышца",
    templateName:
      currentTemplate?.name ??
      source.templateNameSnapshot ??
      source.templateName ??
      source.exerciseTemplateName ??
      templateSnapshot?.templateNameSnapshot ??
      templateSnapshot?.templateName ??
      templateSnapshot?.name ??
      "Шаблон не указан",
  };
}

function normalizeJournalSet(set, index) {
  return {
    setNumber: set?.setNumber ?? index + 1,
    weightKg: set?.weightKg ?? null,
    reps: set?.reps ?? null,
  };
}

function getJournalExerciseName(data, exerciseLog) {
  const exercisesById = indexById(data.exercises ?? []);

  return (
    (exerciseLog.exerciseId ? exercisesById.get(exerciseLog.exerciseId)?.name : null) ??
    exerciseLog.exerciseNameSnapshot ??
    exerciseLog.exerciseName ??
    exerciseLog.name ??
    "Упражнение"
  );
}

function getJournalPlannedExerciseName(data, exerciseLog) {
  const exercisesById = indexById(data.exercises ?? []);
  const plannedExerciseId =
    exerciseLog.plannedExerciseId ??
    exerciseLog.replacement?.plannedExerciseId ??
    null;

  return (
    (plannedExerciseId ? exercisesById.get(plannedExerciseId)?.name : null) ??
    exerciseLog.plannedExerciseNameSnapshot ??
    exerciseLog.replacement?.plannedExerciseNameSnapshot ??
    exerciseLog.plannedExerciseName ??
    null
  );
}

function normalizeJournalSnapshotExercise(data, snapshotExercise, index) {
  const exerciseId =
    typeof snapshotExercise === "object"
      ? snapshotExercise?.id ?? snapshotExercise?.exerciseId ?? null
      : null;
  const currentExercise = exerciseId
    ? (data.exercises ?? []).find((exercise) => exercise.id === exerciseId)
    : null;

  return {
    id: exerciseId ?? `snapshot-${index}`,
    hasStableId: Boolean(exerciseId),
    name: currentExercise?.name ?? getExerciseSnapshotName(snapshotExercise) ?? "Упражнение",
    plannedExerciseId: null,
    plannedName: null,
    isReplacement: false,
    sets: [],
  };
}

function normalizeJournalExercise(data, exerciseLog, index) {
  const name = getJournalExerciseName(data, exerciseLog);
  const plannedExerciseId =
    exerciseLog.plannedExerciseId ??
    exerciseLog.replacement?.plannedExerciseId ??
    null;
  const plannedName = getJournalPlannedExerciseName(data, exerciseLog);
  const isReplacement = Boolean(
    exerciseLog.isReplacement ||
    exerciseLog.replacement ||
    (plannedExerciseId && exerciseLog.exerciseId && plannedExerciseId !== exerciseLog.exerciseId),
  );

  return {
    id: exerciseLog.exerciseId ?? `exercise-${index}`,
    hasStableId: Boolean(exerciseLog.exerciseId),
    name,
    plannedExerciseId,
    plannedName: isReplacement ? plannedName ?? "Плановое упражнение" : null,
    isReplacement,
    sets: (exerciseLog.sets ?? []).map(normalizeJournalSet),
  };
}

function buildJournalSections(data, log) {
  const sections = [];
  const sectionsById = new Map();
  let unknownSectionIndex = 0;

  function ensureSection(muscleGroupId, source = {}) {
    const id =
      muscleGroupId ??
      source.muscleGroupId ??
      source.muscleGroup?.id ??
      `unknown-muscle-${unknownSectionIndex++}`;
    const fallbacks = getJournalSectionFallbacks(data, log, id, source);
    const existing = sectionsById.get(id);
    const hasSnapshotMuscleName = Boolean(
      source.muscleGroupNameSnapshot ||
        source.muscleGroup?.name ||
        (id ? getTemplateSnapshotForMuscleGroup(log, id)?.muscleGroupNameSnapshot : null) ||
        (id ? getMuscleGroupSnapshot(log, id)?.name : null),
    );
    const hasSnapshotTemplateName = Boolean(
      source.templateNameSnapshot ||
        source.templateName ||
        source.exerciseTemplateName ||
        (id ? getTemplateSnapshotForMuscleGroup(log, id)?.templateNameSnapshot : null) ||
        (id ? getTemplateSnapshotForMuscleGroup(log, id)?.templateName : null) ||
        (id ? getTemplateSnapshotForMuscleGroup(log, id)?.name : null),
    );

    if (existing) {
      if (!existing.templateId && fallbacks.templateId) {
        existing.templateId = fallbacks.templateId;
      }

      if (
        (existing.muscleGroup.name === "Мышца" || hasSnapshotMuscleName) &&
        fallbacks.muscleGroupName !== "Мышца"
      ) {
        existing.muscleGroup.name = fallbacks.muscleGroupName;
      }

      if (
        (existing.templateName === "Шаблон не указан" || hasSnapshotTemplateName) &&
        fallbacks.templateName !== "Шаблон не указан"
      ) {
        existing.templateName = fallbacks.templateName;
      }

      return existing;
    }

    const section = {
      muscleGroup: {
        id,
        name: fallbacks.muscleGroupName,
      },
      templateId: fallbacks.templateId,
      templateName: fallbacks.templateName,
      exercises: [],
    };

    sectionsById.set(id, section);
    sections.push(section);
    return section;
  }

  for (const muscleGroupId of log.workoutGroupSnapshot?.muscleGroupIds ?? []) {
    ensureSection(muscleGroupId);
  }

  for (const muscleGroup of log.muscleGroupSnapshots ?? []) {
    ensureSection(muscleGroup.id ?? muscleGroup.muscleGroupId, muscleGroup);
  }

  for (const templateSnapshot of getTemplateSnapshots(log)) {
    ensureSection(templateSnapshot.muscleGroupId ?? templateSnapshot.muscleGroup?.id, templateSnapshot);
  }

  const muscleGroupLogs = log.muscleGroupLogs ?? [];
  const hasNestedExerciseLogs = muscleGroupLogs.some((muscleLog) =>
    Array.isArray(muscleLog.exerciseLogs),
  );

  for (const muscleLog of muscleGroupLogs) {
    const section = ensureSection(muscleLog.muscleGroupId ?? muscleLog.muscleGroup?.id, muscleLog);

    if (Array.isArray(muscleLog.exerciseLogs)) {
      section.exercises.push(
        ...dedupeExerciseLogEntries(muscleLog.exerciseLogs).map((exerciseLog, index) =>
          normalizeJournalExercise(data, exerciseLog, index),
        ),
      );
    }
  }

  if (!hasNestedExerciseLogs) {
    const exerciseLogs = Array.isArray(log.exerciseLogs)
      ? log.exerciseLogs
      : dedupeExerciseLogEntries(collectExerciseLogEntries(log));

    for (const exerciseLog of dedupeExerciseLogEntries(exerciseLogs)) {
      const section = ensureSection(exerciseLog.muscleGroupId, exerciseLog);
      section.exercises.push(normalizeJournalExercise(data, exerciseLog, section.exercises.length));
    }
  }

  for (const section of sections) {
    if (section.exercises.length) {
      continue;
    }

    const snapshot = getTemplateSnapshotForMuscleGroup(log, section.muscleGroup.id);
    const snapshotExercises = Array.isArray(snapshot?.exercises)
      ? snapshot.exercises
      : getExerciseNamesFromSnapshot(snapshot);

    section.exercises = snapshotExercises
      .map((exercise, index) => normalizeJournalSnapshotExercise(data, exercise, index))
      .filter((exercise) => exercise.name);
  }

  return sections.filter((section) => section.exercises.length || section.templateName);
}

function buildJournalEntry(data, log) {
  const date = getWorkoutLogDate(log);

  return {
    id: log.id,
    name: getWorkoutLogName(data, log),
    date: date?.toISOString() ?? log.date ?? null,
    timestamp: date?.getTime() ?? 0,
    sections: buildJournalSections(data, log),
  };
}

export function buildJournalEntries(data) {
  return [...(data.workoutLogs ?? [])]
    .map((log) => buildJournalEntry(data, log))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function buildJournalFilterOptions(data, entries = buildJournalEntries(data)) {
  const exercisesByMuscleGroupId = new Map();

  for (const entry of entries) {
    for (const section of entry.sections ?? []) {
      const muscleGroupId = section.muscleGroup?.id;
      if (!muscleGroupId) {
        continue;
      }

      const exercisesById = exercisesByMuscleGroupId.get(muscleGroupId) ?? new Map();

      for (const exercise of section.exercises ?? []) {
        if (!exercise.hasStableId || !exercise.id || exercisesById.has(exercise.id)) {
          continue;
        }

        exercisesById.set(exercise.id, {
          id: exercise.id,
          name: exercise.name,
          muscleGroupId,
        });
      }

      exercisesByMuscleGroupId.set(muscleGroupId, exercisesById);
    }
  }

  return [...(data.muscleGroups ?? [])]
    .sort((first, second) => Number(first.sortOrder ?? 0) - Number(second.sortOrder ?? 0))
    .map((muscleGroup) => ({
      muscleGroup,
      isAvailable: exercisesByMuscleGroupId.has(muscleGroup.id),
      exercises: [...(exercisesByMuscleGroupId.get(muscleGroup.id)?.values() ?? [])].sort(
        (first, second) => first.name.localeCompare(second.name, "ru"),
      ),
    }));
}

export function filterJournalEntries(entries, filter, filterOptions) {
  const selectedMuscleGroupIds = filter?.selectedMuscleGroupIds ?? [];
  if (!selectedMuscleGroupIds.length) {
    return entries;
  }

  const selectedExerciseIds = new Set(filter?.selectedExerciseIds ?? []);
  const exercisesByMuscleGroupId = new Map(
    (filterOptions ?? []).map((option) => [
      option.muscleGroup.id,
      new Set(
        option.exercises
          .filter((exercise) => selectedExerciseIds.has(exercise.id))
          .map((exercise) => exercise.id),
      ),
    ]),
  );

  return entries.filter((entry) =>
    selectedMuscleGroupIds.some((muscleGroupId) => {
      const section = (entry.sections ?? []).find(
        (item) => item.muscleGroup?.id === muscleGroupId,
      );
      if (!section) {
        return false;
      }

      const selectedExercises = exercisesByMuscleGroupId.get(muscleGroupId);
      if (!selectedExercises?.size) {
        return true;
      }

      return (section.exercises ?? []).some((exercise) =>
        selectedExercises.has(exercise.id),
      );
    }),
  );
}

export function buildJournalWorkoutDetails(data, workoutLogId) {
  const log = (data.workoutLogs ?? []).find((item) => item.id === workoutLogId) ?? null;

  return log ? buildJournalEntry(data, log) : null;
}

function getSelectedTemplateForMuscleGroup(data, workoutGroup, muscleGroupId) {
  const selectedTemplateId = workoutGroup.selectedTemplateByMuscleGroupId?.[muscleGroupId];
  const selectedTemplate = data.exerciseTemplates.find(
    (template) =>
      template.id === selectedTemplateId &&
      template.muscleGroupId === muscleGroupId &&
      !template.isArchived,
  );
  const defaultTemplate = data.exerciseTemplates.find(
    (template) => template.muscleGroupId === muscleGroupId && template.isDefault && !template.isArchived,
  );
  const overrideValue = workoutGroup.selectedTemplateOverrideByMuscleGroupId?.[muscleGroupId];
  const hasManualSelection = overrideValue === true;

  if (selectedTemplate && hasManualSelection) {
    return selectedTemplate;
  }

  return (
    defaultTemplate ??
    selectedTemplate ??
    data.exerciseTemplates.find(
      (template) => template.muscleGroupId === muscleGroupId && !template.isArchived,
    ) ??
    null
  );
}

export function getSelectedTemplateIdForMuscleGroup(data, workoutGroup, muscleGroupId) {
  return getSelectedTemplateForMuscleGroup(data, workoutGroup, muscleGroupId)?.id ?? null;
}

function buildTemplateExerciseItems(data, template, exercisesById) {
  if (!template) {
    return [];
  }

  return template.exerciseIds.map((exerciseId) => {
    const exercise = exercisesById.get(exerciseId);
    const isMissing = !exercise || exercise.isArchived;

    return {
      id: exerciseId,
      name: !isMissing ? exercise.name : "Упражнение не найдено",
      mediaUrl: !isMissing ? exercise.mediaUrl ?? "" : "",
      isMissing,
      lastSets: getLastSetsForExercise(data, exerciseId),
    };
  });
}

function createInitialActiveSetRows() {
  return [{ setNumber: 1, weightKg: "", reps: "" }];
}

export function buildActiveWorkoutSessionDraft(data, workoutGroupId, sessionId, startedAt) {
  const workoutGroup = data.workoutGroups.find((item) => item.id === workoutGroupId) ?? null;

  if (!workoutGroup) {
    return null;
  }

  const muscleGroupsById = indexById(data.muscleGroups);
  const exercisesById = indexById(data.exercises);
  const muscleGroupSnapshots = [];
  const templateSnapshots = [];
  const exerciseLogs = [];

  for (const muscleGroupId of workoutGroup.muscleGroupIds) {
    const muscleGroup = muscleGroupsById.get(muscleGroupId);

    if (!muscleGroup) {
      continue;
    }

    const template = getSelectedTemplateForMuscleGroup(data, workoutGroup, muscleGroupId);
    const templateExerciseSnapshots = (template?.exerciseIds ?? []).map((exerciseId) => {
      const exercise = exercisesById.get(exerciseId);

      return {
        id: exerciseId,
        name: exercise && !exercise.isArchived ? exercise.name : "Упражнение не найдено",
        mediaUrl: exercise && !exercise.isArchived ? exercise.mediaUrl ?? "" : "",
        muscleGroupId,
        muscleGroupNameSnapshot: muscleGroup.name,
        trackingType: exercise?.trackingType ?? "weight_reps",
        isMissing: !exercise || Boolean(exercise.isArchived),
      };
    });

    muscleGroupSnapshots.push({
      id: muscleGroup.id,
      name: muscleGroup.name,
      sortOrder: muscleGroup.sortOrder,
    });

    templateSnapshots.push({
      id: template?.id ?? null,
      name: template?.name ?? "Шаблон не найден",
      muscleGroupId,
      muscleGroupNameSnapshot: muscleGroup.name,
      exerciseIds: templateExerciseSnapshots.map((exercise) => exercise.id),
      exercises: templateExerciseSnapshots,
    });

    for (const exercise of templateExerciseSnapshots) {
      const previousSets = exercise.isMissing ? [] : getLastSetsForExercise(data, exercise.id);

      exerciseLogs.push({
        exerciseId: exercise.id,
        exerciseNameSnapshot: exercise.name,
        mediaUrl: exercise.mediaUrl ?? "",
        plannedExerciseId: exercise.id,
        plannedExerciseNameSnapshot: exercise.name,
        muscleGroupId,
        muscleGroupNameSnapshot: muscleGroup.name,
        templateId: template?.id ?? null,
        templateNameSnapshot: template?.name ?? "Шаблон не найден",
        trackingType: exercise.trackingType,
        previousSets,
        replacement: null,
        sets: createInitialActiveSetRows(),
      });
    }
  }

  return {
    id: sessionId,
    status: "active",
    workoutGroupId: workoutGroup.id,
    startedAt,
    updatedAt: startedAt,
    currentExerciseIndex: 0,
    workoutGroupSnapshot: {
      id: workoutGroup.id,
      name: workoutGroup.name,
      muscleGroupIds: [...workoutGroup.muscleGroupIds],
    },
    muscleGroupSnapshots,
    templateSnapshots,
    exerciseLogs,
  };
}

export function buildFreeWorkoutCard(data) {
  const workoutGroup = {
    id: FREE_WORKOUT_GROUP_ID,
    name: FREE_WORKOUT_NAME,
  };

  return {
    workoutGroup,
    lastWorkoutDate: getLastWorkoutDateForGroup(data, workoutGroup)?.toISOString() ?? null,
  };
}

export function buildFreeWorkoutSessionDraft(data, selectedExerciseIds, sessionId, startedAt) {
  const muscleGroupsById = indexById(data.muscleGroups);
  const exercisesById = indexById(data.exercises);
  const muscleGroupIds = [];
  const muscleGroupSnapshots = [];
  const exerciseLogs = [];
  const usedExerciseIds = new Set();

  for (const exerciseId of selectedExerciseIds ?? []) {
    if (usedExerciseIds.has(exerciseId)) {
      continue;
    }

    const exercise = exercisesById.get(exerciseId);

    if (!exercise || exercise.isArchived) {
      continue;
    }

    const muscleGroup = muscleGroupsById.get(exercise.muscleGroupId);

    if (!muscleGroup) {
      continue;
    }

    usedExerciseIds.add(exercise.id);

    if (!muscleGroupIds.includes(muscleGroup.id)) {
      muscleGroupIds.push(muscleGroup.id);
      muscleGroupSnapshots.push({
        id: muscleGroup.id,
        name: muscleGroup.name,
        sortOrder: muscleGroup.sortOrder,
      });
    }

    const previousSets = getLastSetsForExercise(data, exercise.id);

    exerciseLogs.push({
      exerciseId: exercise.id,
      exerciseNameSnapshot: exercise.name,
      mediaUrl: exercise.mediaUrl ?? "",
      plannedExerciseId: exercise.id,
      plannedExerciseNameSnapshot: exercise.name,
      muscleGroupId: muscleGroup.id,
      muscleGroupNameSnapshot: muscleGroup.name,
      templateId: null,
      templateNameSnapshot: null,
      trackingType: exercise.trackingType ?? "weight_reps",
      previousSets,
      replacement: null,
      sets: createInitialActiveSetRows(),
    });
  }

  return {
    id: sessionId,
    status: "active",
    type: "free",
    workoutGroupId: FREE_WORKOUT_GROUP_ID,
    startedAt,
    updatedAt: startedAt,
    currentExerciseIndex: 0,
    workoutGroupSnapshot: {
      id: FREE_WORKOUT_GROUP_ID,
      name: FREE_WORKOUT_NAME,
      muscleGroupIds,
    },
    muscleGroupSnapshots,
    templateSnapshots: [],
    exerciseLogs,
  };
}

export function buildWorkoutGroupCards(data) {
  return [...data.workoutGroups]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((workoutGroup) => ({
      workoutGroup,
      lastWorkoutDate: getLastWorkoutDateForGroup(data, workoutGroup)?.toISOString() ?? null,
    }));
}

export function buildWorkoutPreparationData(data, workoutGroupId) {
  const workoutGroup = data.workoutGroups.find((item) => item.id === workoutGroupId) ?? null;

  if (!workoutGroup) {
    return {
      workoutGroup: null,
      lastWorkoutDate: null,
      templateRows: [],
      planSections: [],
      previousWorkout: null,
    };
  }

  const muscleGroupsById = indexById(data.muscleGroups);
  const exercisesById = indexById(data.exercises);
  const workoutLogs = getWorkoutLogsForGroup(data, workoutGroup);
  const lastWorkoutLog = workoutLogs[0]?.log ?? null;
  const lastWorkoutDate = workoutLogs[0]?.date?.toISOString() ?? null;
  const sections = workoutGroup.muscleGroupIds
    .map((muscleGroupId) => {
      const muscleGroup = muscleGroupsById.get(muscleGroupId);

      if (!muscleGroup) {
        return null;
      }

      const template = getSelectedTemplateForMuscleGroup(data, workoutGroup, muscleGroupId);
      const exercises = buildTemplateExerciseItems(data, template, exercisesById);
      const availableTemplates = data.exerciseTemplates
        .filter(
          (item) => item.muscleGroupId === muscleGroupId && !item.isArchived,
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          isDefault: Boolean(item.isDefault),
          isSelected: Boolean(template && item.id === template.id),
        }));

      return {
        muscleGroup,
        template: template
          ? {
              id: template.id,
              name: template.name,
            }
          : {
              id: null,
              name: "Шаблон не найден",
              isMissing: true,
            },
        exercises,
        availableTemplates,
      };
    })
    .filter(Boolean);

  const previousWorkout = lastWorkoutLog
    ? {
        id: lastWorkoutLog.id,
        date: lastWorkoutDate,
        sections: sections.map((section) => {
          const snapshot = getTemplateSnapshotForMuscleGroup(lastWorkoutLog, section.muscleGroup.id);
          const muscleGroupLog = getMuscleGroupLogForMuscleGroup(lastWorkoutLog, section.muscleGroup.id);
          const exerciseLogs = getExerciseLogEntriesForMuscleGroup(lastWorkoutLog, section.muscleGroup.id);
          const exerciseNamesFromLogs = exerciseLogs
            .map((entry) => getJournalExerciseName(data, entry))
            .filter(Boolean);
          const exerciseNames = Array.isArray(snapshot?.exercises)
            ? snapshot.exercises
                .map((exercise, index) =>
                  normalizeJournalSnapshotExercise(data, exercise, index).name,
                )
                .filter(Boolean)
            : getExerciseNamesFromSnapshot(snapshot);
          const journalFallbacks = getJournalSectionFallbacks(
            data,
            lastWorkoutLog,
            section.muscleGroup.id,
            muscleGroupLog ?? snapshot ?? {},
          );

          return {
            muscleGroup: {
              ...section.muscleGroup,
              name: journalFallbacks.muscleGroupName,
            },
            templateId: journalFallbacks.templateId,
            templateName: journalFallbacks.templateName,
            exerciseNames: exerciseNamesFromLogs.length > 0 ? exerciseNamesFromLogs : exerciseNames,
          };
        }),
      }
    : null;

  return {
    workoutGroup,
    lastWorkoutDate,
    templateRows: sections.map((section) => ({
      muscleGroup: section.muscleGroup,
      template: section.template,
      availableTemplates: section.availableTemplates,
    })),
    planSections: sections,
    previousWorkout,
  };
}

export function buildTemplateSummariesByMuscleGroup(data) {
  return [...data.muscleGroups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((muscleGroup) => ({
      muscleGroup,
      templateCount: data.exerciseTemplates.filter(
        (template) => template.muscleGroupId === muscleGroup.id && !template.isArchived,
      ).length,
    }));
}

export function buildTemplatesForMuscleGroup(data, muscleGroupId) {
  const muscleGroupsById = indexById(data.muscleGroups);
  const exercisesById = indexById(data.exercises);
  const muscleGroup = muscleGroupsById.get(muscleGroupId) ?? null;
  const templates = data.exerciseTemplates
    .filter((template) => template.muscleGroupId === muscleGroupId && !template.isArchived)
    .map((template) => ({
      ...template,
      isProtected: isProtectedTemplate(template),
      exercises: template.exerciseIds.map((exerciseId) => {
        const exercise = exercisesById.get(exerciseId);

        return {
          id: exerciseId,
          name: exercise?.name ?? "Упражнение не найдено",
          isMissing: !exercise,
        };
      }),
    }));

  return {
    muscleGroup,
    templates,
  };
}

function pushUniqueExerciseIds(target, seenExerciseIds, exerciseIds) {
  for (const exerciseId of exerciseIds ?? []) {
    if (!seenExerciseIds.has(exerciseId)) {
      seenExerciseIds.add(exerciseId);
      target.push(exerciseId);
    }
  }
}

function getTemplateExerciseChoiceOrder(data, muscleGroupId, template = null) {
  const orderedExerciseIds = [];
  const seenExerciseIds = new Set();

  pushUniqueExerciseIds(orderedExerciseIds, seenExerciseIds, template?.exerciseIds);

  const defaultTemplate = data.exerciseTemplates.find(
    (item) => item.muscleGroupId === muscleGroupId && item.isDefault && !item.isArchived,
  );

  pushUniqueExerciseIds(orderedExerciseIds, seenExerciseIds, defaultTemplate?.exerciseIds);

  const standardTemplate = data.exerciseTemplates.find(
    (item) => item.muscleGroupId === muscleGroupId && isProtectedTemplate(item) && !item.isArchived,
  );

  pushUniqueExerciseIds(orderedExerciseIds, seenExerciseIds, standardTemplate?.exerciseIds);

  pushUniqueExerciseIds(
    orderedExerciseIds,
    seenExerciseIds,
    data.exercises
      .filter((exercise) => exercise.muscleGroupId === muscleGroupId && !exercise.isArchived)
      .map((exercise) => exercise.id),
  );

  return orderedExerciseIds;
}

function buildTemplateExerciseChoices(data, muscleGroupId, template = null) {
  const exercisesById = indexById(
    data.exercises.filter((exercise) => exercise.muscleGroupId === muscleGroupId && !exercise.isArchived),
  );

  return getTemplateExerciseChoiceOrder(data, muscleGroupId, template)
    .map((exerciseId) => exercisesById.get(exerciseId))
    .filter(Boolean);
}

export function buildTemplateCreationData(data, muscleGroupId) {
  const muscleGroupsById = indexById(data.muscleGroups);

  return {
    muscleGroup: muscleGroupsById.get(muscleGroupId) ?? null,
    exercises: buildTemplateExerciseChoices(data, muscleGroupId),
  };
}

export function buildTemplateEditingData(data, templateId) {
  const template = data.exerciseTemplates.find((item) => item.id === templateId) ?? null;
  const muscleGroupsById = indexById(data.muscleGroups);

  return {
    muscleGroup: template ? muscleGroupsById.get(template.muscleGroupId) ?? null : null,
    exercises: template ? buildTemplateExerciseChoices(data, template.muscleGroupId, template) : [],
    template: template ? { ...template, isProtected: isProtectedTemplate(template) } : null,
  };
}

export function buildExerciseSummariesByMuscleGroup(data) {
  return [...data.muscleGroups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((muscleGroup) => ({
      muscleGroup,
      exerciseCount: data.exercises.filter(
        (exercise) => exercise.muscleGroupId === muscleGroup.id && !exercise.isArchived,
      ).length,
    }));
}

export function buildExercisesForMuscleGroup(data, muscleGroupId) {
  const muscleGroupsById = indexById(data.muscleGroups);

  return {
    muscleGroup: muscleGroupsById.get(muscleGroupId) ?? null,
    exercises: data.exercises.filter(
      (exercise) => exercise.muscleGroupId === muscleGroupId && !exercise.isArchived,
    ),
  };
}

export function buildExerciseCreationData(data, muscleGroupId) {
  const muscleGroupsById = indexById(data.muscleGroups);

  return {
    muscleGroup: muscleGroupsById.get(muscleGroupId) ?? null,
  };
}

export function buildExerciseEditingData(data, exerciseId) {
  const exercise = data.exercises.find((item) => item.id === exerciseId) ?? null;
  const creationData = exercise
    ? buildExerciseCreationData(data, exercise.muscleGroupId)
    : { muscleGroup: null };

  return {
    ...creationData,
    exercise,
  };
}

export function buildCycleItems(data) {
  const workoutGroupsById = indexById(data.workoutGroups);
  const cycle = getDefaultCycle(data);

  if (!cycle) {
    return [];
  }

  return cycle.workoutGroupIds
    .map((workoutGroupId, index) => {
      const workoutGroup = workoutGroupsById.get(workoutGroupId);

      if (!workoutGroup) {
        return null;
      }

      return {
        workoutGroup,
        index,
      };
    })
    .filter(Boolean);
}
