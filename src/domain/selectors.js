import { isProtectedTemplate } from "./templateRules.js";

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function getDefaultCycle(data) {
  return data.workoutCycles.find((cycle) => cycle.id === "cycle-default") ?? data.workoutCycles[0];
}

export function getCycleProgress(data) {
  const cycle = getDefaultCycle(data);

  if (!cycle) {
    return {
      completedCount: 0,
      totalCount: 0,
    };
  }

  const cycleWorkoutGroupIds = new Set(cycle.workoutGroupIds);
  const completedCount = cycle.completedWorkoutGroupIdsInCurrentRound.filter((workoutGroupId) =>
    cycleWorkoutGroupIds.has(workoutGroupId),
  ).length;

  return {
    completedCount,
    totalCount: cycle.workoutGroupIds.length,
  };
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

function getLastSetForExercise(data, exerciseId) {
  const lastSets = getLastSetsForExercise(data, exerciseId);

  return lastSets[lastSets.length - 1] ?? null;
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

function getSelectedTemplateForMuscleGroup(data, workoutGroup, muscleGroupId) {
  const selectedTemplateId = workoutGroup.selectedTemplateByMuscleGroupId?.[muscleGroupId];
  const selectedTemplate = data.exerciseTemplates.find(
    (template) =>
      template.id === selectedTemplateId &&
      template.muscleGroupId === muscleGroupId &&
      !template.isArchived,
  );

  if (selectedTemplate) {
    return selectedTemplate;
  }

  return (
    data.exerciseTemplates.find(
      (template) => template.muscleGroupId === muscleGroupId && template.isDefault && !template.isArchived,
    ) ??
    data.exerciseTemplates.find(
      (template) => template.muscleGroupId === muscleGroupId && !template.isArchived,
    ) ??
    null
  );
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
      isMissing,
      lastSet: getLastSetForExercise(data, exerciseId),
    };
  });
}

function createInitialActiveSetRows(previousSets) {
  const sourceSets = previousSets.length
    ? previousSets
    : Array.from({ length: 4 }, (_, index) => ({ setNumber: index + 1, weightKg: "", reps: "" }));

  return sourceSets.map((set, index) => ({
    setNumber: index + 1,
    weightKg: set.weightKg === undefined || set.weightKg === null ? "" : String(set.weightKg),
    reps: set.reps === undefined || set.reps === null ? "" : String(set.reps),
  }));
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
        plannedExerciseId: exercise.id,
        plannedExerciseNameSnapshot: exercise.name,
        muscleGroupId,
        muscleGroupNameSnapshot: muscleGroup.name,
        templateId: template?.id ?? null,
        templateNameSnapshot: template?.name ?? "Шаблон не найден",
        trackingType: exercise.trackingType,
        previousSets,
        replacement: null,
        sets: createInitialActiveSetRows(previousSets),
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
          const exerciseLogs = collectExerciseLogEntries(lastWorkoutLog).filter(
            (entry) => entry.muscleGroupId === section.muscleGroup.id,
          );
          const exerciseNamesFromLogs = exerciseLogs
            .map((entry) => entry.exerciseNameSnapshot ?? entry.exerciseName ?? entry.name)
            .filter(Boolean);
          const exerciseNames = getExerciseNamesFromSnapshot(snapshot);

          return {
            muscleGroup: section.muscleGroup,
            templateName:
              snapshot?.templateName ??
              snapshot?.name ??
              snapshot?.exerciseTemplateName ??
              section.template.name,
            exerciseNames: exerciseNames.length > 0 ? exerciseNames : exerciseNamesFromLogs,
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
