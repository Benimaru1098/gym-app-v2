import {
  STANDARD_TEMPLATE_NAME,
  getStandardTemplateId,
  isProtectedTemplate,
} from "../domain/templateRules.js";
import { SCHEMA_VERSION, createInitialData, initialData } from "./seed.js";

const DB_NAME = "gym-cycle-db";
const DB_VERSION = 1;

const STORE_NAMES = [
  "metadata",
  "muscleGroups",
  "exercises",
  "exerciseTemplates",
  "workoutGroups",
  "workoutCycles",
  "workoutLogs",
  "activeWorkoutSessions",
];

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function createStores(database) {
  for (const storeName of STORE_NAMES) {
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName, { keyPath: "id" });
    }
  }
}

export function openAppDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      createStores(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore(database, storeName) {
  const transaction = database.transaction(storeName, "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore(storeName).getAll();
  const result = await requestToPromise(request);
  await done;
  return result;
}

async function readMetadata(database) {
  const transaction = database.transaction("metadata", "readonly");
  const done = transactionDone(transaction);
  const request = transaction.objectStore("metadata").get("app");
  const result = await requestToPromise(request);
  await done;
  return result;
}

function normalizeExerciseTemplate(template) {
  const isProtected = isProtectedTemplate(template);

  return {
    ...template,
    name: isProtected ? STANDARD_TEMPLATE_NAME : template.name,
    isDefault: Boolean(template.isDefault),
    isArchived: isProtected ? false : Boolean(template.isArchived),
    isSystem: isProtected ? true : Boolean(template.isSystem),
    usageCount: Number(template.usageCount ?? 0),
  };
}

function normalizeExercise(exercise) {
  return {
    ...exercise,
    isArchived: Boolean(exercise.isArchived),
    usageCount: Number(exercise.usageCount ?? 0),
  };
}

function getNormalizedTemplatesForMuscleGroup(templates, muscleGroupId, preferredDefaultId = null) {
  const normalizedTemplates = templates.map(normalizeExerciseTemplate);
  const muscleTemplates = normalizedTemplates.filter(
    (template) => template.muscleGroupId === muscleGroupId,
  );
  const activeTemplates = muscleTemplates.filter((template) => !template.isArchived);
  const standardTemplateId = getStandardTemplateId(muscleGroupId);
  const preferredDefaultTemplate = preferredDefaultId
    ? activeTemplates.find((template) => template.id === preferredDefaultId)
    : null;
  const currentDefaultTemplate = activeTemplates.find((template) => template.isDefault);
  const standardTemplate = activeTemplates.find((template) => template.id === standardTemplateId);
  const fallbackTemplate = preferredDefaultTemplate ?? currentDefaultTemplate ?? standardTemplate ?? activeTemplates[0];
  const defaultTemplateId = fallbackTemplate?.id ?? null;

  return {
    defaultTemplateId,
    templates: normalizedTemplates.map((template) => {
      if (template.muscleGroupId !== muscleGroupId) {
        return template;
      }

      return {
        ...template,
        isDefault: Boolean(defaultTemplateId && template.id === defaultTemplateId),
      };
    }),
  };
}

function hasExerciseReference(value, exerciseId) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasExerciseReference(item, exerciseId));
  }

  if (value.exerciseId === exerciseId) {
    return true;
  }

  return Object.values(value).some((item) => hasExerciseReference(item, exerciseId));
}

function getInitialStandardTemplates() {
  return initialData.exerciseTemplates.filter((template) => isProtectedTemplate(template));
}

function haveDifferentTemplateData(firstTemplate, secondTemplate) {
  return JSON.stringify(firstTemplate) !== JSON.stringify(secondTemplate);
}

async function ensureSystemTemplates(database) {
  const templates = await readStore(database, "exerciseTemplates");
  const metadata = await readMetadata(database);
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const muscleGroupIds = new Set();

  for (const standardTemplate of getInitialStandardTemplates()) {
    const existingTemplate = templatesById.get(standardTemplate.id);

    muscleGroupIds.add(standardTemplate.muscleGroupId);
    templatesById.set(
      standardTemplate.id,
      normalizeExerciseTemplate({
        ...standardTemplate,
        ...existingTemplate,
        id: standardTemplate.id,
        muscleGroupId: standardTemplate.muscleGroupId,
        isArchived: false,
        isSystem: true,
      }),
    );
  }

  let normalizedTemplates = [...templatesById.values()];

  for (const muscleGroupId of muscleGroupIds) {
    normalizedTemplates = getNormalizedTemplatesForMuscleGroup(
      normalizedTemplates,
      muscleGroupId,
    ).templates;
  }

  const existingTemplatesById = new Map(templates.map((template) => [template.id, template]));
  const hasChanges =
    normalizedTemplates.length !== templates.length ||
    normalizedTemplates.some((template) =>
      haveDifferentTemplateData(existingTemplatesById.get(template.id), template),
    );

  if (!hasChanges) {
    return;
  }

  const transaction = database.transaction(["metadata", "exerciseTemplates"], "readwrite");
  const done = transactionDone(transaction);
  const templateStore = transaction.objectStore("exerciseTemplates");

  for (const template of normalizedTemplates) {
    templateStore.put(template);
  }

  transaction.objectStore("metadata").put({
    id: "app",
    schemaVersion: SCHEMA_VERSION,
    createdAt: metadata?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await done;
}

async function seedDatabase(database) {
  const data = createInitialData();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  const done = transactionDone(transaction);

  for (const storeName of STORE_NAMES) {
    transaction.objectStore(storeName).clear();
  }

  transaction.objectStore("metadata").put(data.metadata);

  for (const muscleGroup of data.muscleGroups) {
    transaction.objectStore("muscleGroups").put(muscleGroup);
  }

  for (const exercise of data.exercises) {
    transaction.objectStore("exercises").put(normalizeExercise(exercise));
  }

  for (const template of data.exerciseTemplates) {
    transaction.objectStore("exerciseTemplates").put(template);
  }

  for (const workoutGroup of data.workoutGroups) {
    transaction.objectStore("workoutGroups").put(workoutGroup);
  }

  for (const cycle of data.workoutCycles) {
    transaction.objectStore("workoutCycles").put(cycle);
  }

  await done;
  return data;
}

async function ensureSeedData(database) {
  const metadata = await readMetadata(database);

  if (!metadata) {
    await seedDatabase(database);
    await ensureSystemTemplates(database);
    return;
  }

  if (metadata.schemaVersion !== SCHEMA_VERSION) {
    console.warn(
      `Stored schema version ${metadata.schemaVersion} differs from app schema ${SCHEMA_VERSION}.`,
    );
  }

  await ensureSystemTemplates(database);
}

export async function loadAppData() {
  const database = await openAppDatabase();

  try {
    await ensureSeedData(database);

    const [
      metadataItems,
      muscleGroups,
      exercises,
      exerciseTemplates,
      workoutGroups,
      workoutCycles,
      workoutLogs,
      activeWorkoutSessions,
    ] = await Promise.all([
      readStore(database, "metadata"),
      readStore(database, "muscleGroups"),
      readStore(database, "exercises"),
      readStore(database, "exerciseTemplates"),
      readStore(database, "workoutGroups"),
      readStore(database, "workoutCycles"),
      readStore(database, "workoutLogs"),
      readStore(database, "activeWorkoutSessions"),
    ]);

    return {
      metadata: metadataItems.find((item) => item.id === "app") ?? null,
      muscleGroups,
      exercises: exercises.map(normalizeExercise),
      exerciseTemplates,
      workoutGroups,
      workoutCycles,
      workoutLogs,
      activeWorkoutSessions,
    };
  } finally {
    database.close();
  }
}

export async function exportAppData() {
  return loadAppData();
}

export async function saveExerciseTemplate(template) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const templates = await readStore(database, "exerciseTemplates");
    const normalizedTemplate = normalizeExerciseTemplate(template);
    const templatesAfterSave = templates.some((item) => item.id === normalizedTemplate.id)
      ? templates.map((item) => (item.id === normalizedTemplate.id ? normalizedTemplate : item))
      : [...templates, normalizedTemplate];
    const preferredDefaultId = normalizedTemplate.isDefault ? normalizedTemplate.id : null;
    const normalizedResult = getNormalizedTemplatesForMuscleGroup(
      templatesAfterSave,
      normalizedTemplate.muscleGroupId,
      preferredDefaultId,
    );
    const transaction = database.transaction(["metadata", "exerciseTemplates"], "readwrite");
    const done = transactionDone(transaction);
    const templateStore = transaction.objectStore("exerciseTemplates");

    for (const nextTemplate of normalizedResult.templates) {
      if (nextTemplate.muscleGroupId === normalizedTemplate.muscleGroupId) {
        templateStore.put(nextTemplate);
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;
  } finally {
    database.close();
  }
}

export async function saveExercise(exercise) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const transaction = database.transaction(["metadata", "exercises"], "readwrite");
    const done = transactionDone(transaction);
    const normalizedExercise = normalizeExercise(exercise);

    transaction.objectStore("exercises").put(normalizedExercise);
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;
  } finally {
    database.close();
  }
}

export async function saveWorkoutGroupSelectedTemplate(workoutGroupId, muscleGroupId, templateId) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const workoutGroups = await readStore(database, "workoutGroups");
    const templates = await readStore(database, "exerciseTemplates");
    const workoutGroup = workoutGroups.find((item) => item.id === workoutGroupId);
    const template = templates.find(
      (item) =>
        item.id === templateId &&
        item.muscleGroupId === muscleGroupId &&
        !item.isArchived,
    );

    if (!workoutGroup) {
      return { status: "missing-workout-group" };
    }

    if (!template) {
      return { status: "missing-template" };
    }

    const transaction = database.transaction(["metadata", "workoutGroups"], "readwrite");
    const done = transactionDone(transaction);

    transaction.objectStore("workoutGroups").put({
      ...workoutGroup,
      selectedTemplateByMuscleGroupId: {
        ...workoutGroup.selectedTemplateByMuscleGroupId,
        [muscleGroupId]: template.id,
      },
    });
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;

    return { status: "updated" };
  } finally {
    database.close();
  }
}

export async function deleteExercise(exerciseId) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const exercises = await readStore(database, "exercises");
    const templates = await readStore(database, "exerciseTemplates");
    const workoutLogs = await readStore(database, "workoutLogs");
    const activeWorkoutSessions = await readStore(database, "activeWorkoutSessions");
    const exercise = exercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      return { status: "missing" };
    }

    const normalizedExercise = normalizeExercise(exercise);
    const activeTemplatesWithExercise = templates.filter(
      (template) => !template.isArchived && template.exerciseIds?.includes(exerciseId),
    );
    const hasTemplateReferences = activeTemplatesWithExercise.length > 0;
    const hasHistoryReferences =
      normalizedExercise.usageCount > 0 ||
      workoutLogs.some((log) => hasExerciseReference(log, exerciseId));
    const hasActiveSessionReferences = activeWorkoutSessions.some((session) =>
      hasExerciseReference(session, exerciseId),
    );
    const shouldArchive =
      hasTemplateReferences || hasHistoryReferences || hasActiveSessionReferences;
    const transaction = database.transaction(
      ["metadata", "exercises", "exerciseTemplates"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const exerciseStore = transaction.objectStore("exercises");
    const templateStore = transaction.objectStore("exerciseTemplates");

    if (shouldArchive) {
      exerciseStore.put({
        ...normalizedExercise,
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });

      for (const template of activeTemplatesWithExercise) {
        templateStore.put({
          ...template,
          exerciseIds: template.exerciseIds.filter((id) => id !== exerciseId),
        });
      }
    } else {
      exerciseStore.delete(normalizedExercise.id);
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;

    return {
      status: shouldArchive ? "archived" : "deleted",
      removedFromTemplateCount: activeTemplatesWithExercise.length,
      hasHistoryReferences,
      hasActiveSessionReferences,
    };
  } finally {
    database.close();
  }
}

export async function deleteExerciseTemplate(templateId) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const templates = await readStore(database, "exerciseTemplates");
    const workoutGroups = await readStore(database, "workoutGroups");
    const template = templates.find((item) => item.id === templateId);

    if (!template) {
      return { status: "missing" };
    }

    if (isProtectedTemplate(template)) {
      return { status: "protected" };
    }

    const shouldArchive = Number(template.usageCount ?? 0) > 0;
    const templatesAfterDelete = shouldArchive
      ? templates.map((item) =>
          item.id === template.id
            ? normalizeExerciseTemplate({
                ...item,
                isDefault: false,
                isArchived: true,
                archivedAt: new Date().toISOString(),
              })
            : item,
        )
      : templates.filter((item) => item.id !== template.id);
    const normalizedResult = getNormalizedTemplatesForMuscleGroup(
      templatesAfterDelete,
      template.muscleGroupId,
    );
    const fallbackTemplateId =
      normalizedResult.defaultTemplateId ?? getStandardTemplateId(template.muscleGroupId);
    const transaction = database.transaction(
      ["metadata", "exerciseTemplates", "workoutGroups"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const templateStore = transaction.objectStore("exerciseTemplates");
    const workoutGroupStore = transaction.objectStore("workoutGroups");

    if (shouldArchive) {
      const archivedTemplate = templatesAfterDelete.find((item) => item.id === template.id);

      templateStore.put(archivedTemplate);
    } else {
      templateStore.delete(template.id);
    }

    for (const nextTemplate of normalizedResult.templates) {
      if (nextTemplate.muscleGroupId === template.muscleGroupId && nextTemplate.id !== template.id) {
        templateStore.put(nextTemplate);
      }
    }

    if (fallbackTemplateId) {
      for (const workoutGroup of workoutGroups) {
        if (workoutGroup.selectedTemplateByMuscleGroupId?.[template.muscleGroupId] !== template.id) {
          continue;
        }

        workoutGroupStore.put({
          ...workoutGroup,
          selectedTemplateByMuscleGroupId: {
            ...workoutGroup.selectedTemplateByMuscleGroupId,
            [template.muscleGroupId]: fallbackTemplateId,
          },
        });
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;

    return { status: shouldArchive ? "archived" : "deleted" };
  } finally {
    database.close();
  }
}

export async function clearWorkoutLogs() {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const workoutCycles = await readStore(database, "workoutCycles");
    const transaction = database.transaction(
      ["metadata", "workoutCycles", "workoutLogs"],
      "readwrite",
    );
    const done = transactionDone(transaction);

    transaction.objectStore("workoutLogs").clear();

    for (const cycle of workoutCycles) {
      transaction.objectStore("workoutCycles").put({
        ...cycle,
        currentIndex: 0,
        completedWorkoutGroupIdsInCurrentRound: [],
      });
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await done;
  } finally {
    database.close();
  }
}
