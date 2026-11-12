import { collectExerciseLogEntries, getTemplateSnapshots, getWorkoutLogExerciseKey } from "../domain/selectors.js";
import {
  STANDARD_TEMPLATE_NAME,
  getStandardTemplateId,
  isProtectedTemplate,
} from "../domain/templateRules.js";
import { localizeTemplateName } from "../i18n/catalog.js";
import { APP_LANGUAGES } from "../i18n/index.js";
import { SCHEMA_VERSION, createInitialData, initialData } from "./seed.js";
import techniqueCatalog from "./exercise-techniques.json" with { type: "json" };
import legacyTechniqueFingerprints from "./legacy-technique-fingerprints.json" with { type: "json" };
import { isNativeAndroid } from "../platform/android.js";

const DB_NAME = "gym-cycle-db";
const DB_VERSION = 3;
const BACKUP_REVISION_ID = "backup-revision";
export const BACKUP_DATA_CHANGED = "gym-cycle-backup-data-changed";
const DEFAULT_TECHNIQUE_BY_ID = new Map(
  Object.entries(techniqueCatalog).map(([id, steps]) => [id, steps.join("\n")]),
);

const STORE_NAMES = [
  "metadata",
  "muscleGroups",
  "exercises",
  "exerciseTemplates",
  "workoutGroups",
  "workoutLogs",
  "activeWorkoutSessions",
];

const EXPORT_APP_ID = "gym-app";
const EXPORT_FORMAT = "gym-app-data-export";
const EXPORT_VERSION = 1;
const IMPORT_STORE_NAMES = [
  "exercises",
  "exerciseTemplates",
  "workoutGroups",
  "workoutLogs",
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

function markBackupChange(transaction) {
  if (!isNativeAndroid) return;

  transaction.objectStore("metadata").put({ id: BACKUP_REVISION_ID, revision: crypto.randomUUID() });
  transaction.addEventListener("complete", () => window.dispatchEvent(new Event(BACKUP_DATA_CHANGED)), { once: true });
}

export async function readBackupRevision() {
  const database = await openAppDatabase();
  try {
    const transaction = database.transaction("metadata", "readonly");
    const [record] = await Promise.all([
      requestToPromise(transaction.objectStore("metadata").get(BACKUP_REVISION_ID)),
      transactionDone(transaction),
    ]);
    return record?.revision ?? "initial";
  } finally {
    database.close();
  }
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
  const normalizedTemplate = { ...template };

  delete normalizedTemplate.isDefault;
  delete normalizedTemplate.isProtected;

  const isSystem = isProtectedTemplate(normalizedTemplate);

  return {
    ...normalizedTemplate,
    name: isSystem ? STANDARD_TEMPLATE_NAME : template.name,
    isArchived: !isSystem && Boolean(template.isArchived),
    isSystem,
    usageCount: Number(template.usageCount ?? 0),
  };
}

function getTemplateNameKeys(template) {
  if (typeof template.name !== "string") {
    return [];
  }

  return APP_LANGUAGES.map(({ code }) =>
    localizeTemplateName(template.id, template.name, code).normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase(),
  );
}

function isLegacyDefaultTechnique(exerciseId, description) {
  const fingerprint = legacyTechniqueFingerprints[exerciseId];
  if (typeof fingerprint !== "string" || !fingerprint.startsWith(`${description.length}:`)) {
    return false;
  }

  let hash = 2166136261;
  for (let index = 0; index < description.length; index += 1) {
    hash = Math.imul(hash ^ description.charCodeAt(index), 16777619);
  }
  return fingerprint === `${description.length}:${(hash >>> 0).toString(16)}`;
}

function normalizeExercise(exercise) {
  const { techniqueDescription, ...record } = exercise;
  const description = typeof techniqueDescription === "string" ? techniqueDescription.trim() : undefined;
  const defaultDescription = DEFAULT_TECHNIQUE_BY_ID.get(exercise.id);
  // Храним только личный текст. Старые сборки записывали в базу и стандартный.
  if (description !== undefined &&
    (defaultDescription === undefined ||
      (description !== defaultDescription && !isLegacyDefaultTechnique(exercise.id, description)))) {
    record.techniqueDescription = description;
  }

  return {
    ...record,
    mediaUrl: typeof exercise.mediaUrl === "string" ? exercise.mediaUrl.trim() : "",
    isArchived: Boolean(exercise.isArchived),
    usageCount: Number(exercise.usageCount ?? 0),
  };
}

function normalizeWorkoutGroup(workoutGroup) {
  const normalizedWorkoutGroup = { ...workoutGroup };

  delete normalizedWorkoutGroup.selectedTemplateOverrideByMuscleGroupId;

  return {
    ...normalizedWorkoutGroup,
    muscleGroupIds: [...(workoutGroup.muscleGroupIds ?? [])],
    selectedTemplateByMuscleGroupId: { ...(workoutGroup.selectedTemplateByMuscleGroupId ?? {}) },
    orderIndex: Number(workoutGroup.orderIndex ?? 0),
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

function isAvailableTemplateExercise(exercise, muscleGroupId) {
  return Boolean(exercise && !exercise.isArchived && exercise.muscleGroupId === muscleGroupId);
}

function withSystemTemplates(templates, exercisesById) {
  const templatesById = new Map(templates.map((template) => [template.id, template]));

  for (const standardTemplate of getInitialStandardTemplates()) {
    const existingTemplate = templatesById.get(standardTemplate.id);
    const fallbackExerciseIds = exercisesById && existingTemplate?.exerciseIds === undefined
      ? standardTemplate.exerciseIds.filter((id) =>
          isAvailableTemplateExercise(exercisesById.get(id), standardTemplate.muscleGroupId),
        )
      : standardTemplate.exerciseIds;

    templatesById.set(standardTemplate.id, {
      ...standardTemplate,
      exerciseIds: fallbackExerciseIds,
      ...existingTemplate,
      muscleGroupId: standardTemplate.muscleGroupId,
    });
  }

  return [...templatesById.values()].map(normalizeExerciseTemplate);
}

async function ensureSystemTemplates(database) {
  const transaction = database.transaction(["metadata", "exerciseTemplates"], "readwrite");
  const done = transactionDone(transaction);
  const templateStore = transaction.objectStore("exerciseTemplates");
  const metadataStore = transaction.objectStore("metadata");

  const updateTemplates = Promise.all([
    requestToPromise(templateStore.getAll()),
    requestToPromise(metadataStore.get("app")),
  ]).then(([templates, metadata]) => {
    const existingById = new Map(templates.map((template) => [template.id, template]));
    const changedTemplates = withSystemTemplates(templates).filter((template) =>
      haveDifferentTemplateData(existingById.get(template.id), template),
    );
    if (!changedTemplates.length) {
      return;
    }
    for (const template of changedTemplates) {
      templateStore.put(template);
    }
    const now = new Date().toISOString();
    metadataStore.put({
      ...metadata,
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });
    markBackupChange(transaction);
  });

  await Promise.all([updateTemplates, done]);
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

  markBackupChange(transaction);
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

export async function loadAppData({ includeActiveSessions = true } = {}) {
  const database = await openAppDatabase();

  try {
    await ensureSeedData(database);

    const storeNames = includeActiveSessions ? STORE_NAMES : STORE_NAMES.filter((name) => name !== "activeWorkoutSessions");
    const transaction = database.transaction(storeNames, "readonly");
    const done = transactionDone(transaction);
    const [records] = await Promise.all([
      Promise.all(storeNames.map((name) => requestToPromise(transaction.objectStore(name).getAll()))),
      done,
    ]);
    const [
      metadataItems,
      muscleGroups,
      exercises,
      exerciseTemplates,
      workoutGroups,
      workoutLogs,
      activeWorkoutSessions = [],
    ] = records;

    return {
      metadata: metadataItems.find((item) => item.id === "app") ?? null,
      muscleGroups,
      exercises: exercises.map((exercise) => {
        const record = normalizeExercise(exercise);
        record.techniqueDescription ??= DEFAULT_TECHNIQUE_BY_ID.get(exercise.id) ?? "";
        return record;
      }),
      exerciseTemplates: exerciseTemplates.map(normalizeExerciseTemplate),
      workoutGroups: workoutGroups.map(normalizeWorkoutGroup),
      workoutLogs,
      activeWorkoutSessions,
    };
  } finally {
    database.close();
  }
}

export async function exportAppData() {
  const data = await loadAppData({ includeActiveSessions: false });

  return {
    app: EXPORT_APP_ID,
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    description:
      "Файл переноса данных Gym App. Незавершённые тренировки не экспортируются.",
    data: {
      metadata: data.metadata,
      muscleGroups: [...data.muscleGroups].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
      exercises: data.exercises,
      exerciseTemplates: data.exerciseTemplates.map(normalizeExerciseTemplate),
      workoutGroups: data.workoutGroups.map(normalizeWorkoutGroup),
      workoutLogs: [...data.workoutLogs].sort((a, b) => {
        const firstDate = new Date(a.date ?? a.completedAt ?? 0).getTime();
        const secondDate = new Date(b.date ?? b.completedAt ?? 0).getTime();
        return secondDate - firstDate;
      }),
    },
  };
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getImportDataPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid import file");
  }

  if (
    payload.app === EXPORT_APP_ID &&
    payload.format === EXPORT_FORMAT &&
    payload.version === EXPORT_VERSION &&
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    if (IMPORT_STORE_NAMES.every((storeName) => Array.isArray(payload.data[storeName]))) {
      return payload.data;
    }
  }

  throw new Error("Unsupported import file");
}

export function getImportDataCounts(payload) {
  const source = getImportDataPayload(payload);
  return Object.fromEntries(IMPORT_STORE_NAMES.map((storeName) => [storeName, source[storeName].length]));
}

function normalizeImportedRecord(record, storeName) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Invalid ${storeName} record`);
  }

  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new Error(`Invalid ${storeName} record id`);
  }

  return cloneJsonValue(record);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalText(value) {
  return value == null || typeof value === "string";
}

function isOptionalNumberOrText(value) {
  return isOptionalText(value) || typeof value === "number";
}

function hasOptionalTextFields(record, fields) {
  return isRecord(record) && fields.every((field) => isOptionalText(record[field]));
}

function isOptionalArrayOf(value, isValidItem) {
  return value == null || (Array.isArray(value) && value.every(isValidItem));
}

function isValidLogSection(section) {
  return hasOptionalTextFields(section, [
    "id", "name", "muscleGroupId", "muscleGroupNameSnapshot",
    "templateId", "exerciseTemplateId", "templateName", "templateNameSnapshot", "exerciseTemplateName",
  ]) &&
    (section.muscleGroup == null || hasOptionalTextFields(section.muscleGroup, ["id", "name"])) &&
    (section.template == null || hasOptionalTextFields(section.template, ["id"]));
}

function isValidExerciseLog(exercise) {
  return isValidLogSection(exercise) &&
    hasOptionalTextFields(exercise, [
      "exerciseId", "exerciseName", "exerciseNameSnapshot",
      "plannedExerciseId", "plannedExerciseName", "plannedExerciseNameSnapshot",
    ]) &&
    (exercise.replacement == null ||
      hasOptionalTextFields(exercise.replacement, ["plannedExerciseId", "plannedExerciseNameSnapshot"])) &&
    isOptionalArrayOf(exercise.sets, (set) =>
      isRecord(set) && [set.setNumber, set.weightKg, set.reps].every(isOptionalNumberOrText),
    );
}

function isValidTemplateSnapshot(template) {
  return isValidLogSection(template) &&
    isOptionalArrayOf(template.exerciseNames, isOptionalText) &&
    isOptionalArrayOf(template.exercises, (exercise) =>
      typeof exercise === "string" ||
      hasOptionalTextFields(exercise, ["id", "exerciseId", "name", "exerciseName", "exerciseNameSnapshot"]),
    );
}

function validateImportedWorkoutLog(log) {
  const { workoutGroupSnapshot, muscleGroupSnapshots, templateSnapshots, muscleGroupLogs, exerciseLogs } = log;
  if (
    !hasOptionalTextFields(log, ["workoutGroupId", "workoutGroupNameSnapshot"]) ||
    !isOptionalNumberOrText(log.date) ||
    !isOptionalNumberOrText(log.completedAt) ||
    (workoutGroupSnapshot != null && (
      !hasOptionalTextFields(workoutGroupSnapshot, ["id", "workoutGroupId", "name"]) ||
      !isOptionalArrayOf(workoutGroupSnapshot.muscleGroupIds, (id) => typeof id === "string")
    )) ||
    !isOptionalArrayOf(muscleGroupSnapshots, isValidLogSection) ||
    (templateSnapshots != null && !Array.isArray(templateSnapshots) && !isRecord(templateSnapshots)) ||
    !getTemplateSnapshots(log).every(isValidTemplateSnapshot) ||
    !isOptionalArrayOf(muscleGroupLogs, (group) =>
      isValidLogSection(group) && isOptionalArrayOf(group.exerciseLogs, isValidExerciseLog),
    ) ||
    !isOptionalArrayOf(exerciseLogs, isValidExerciseLog)
  ) {
    throw new ImportSelectionError("import.invalidWorkoutLogs");
  }
  return log;
}

const importNormalizers = {
  exercises: normalizeExercise,
  exerciseTemplates: normalizeExerciseTemplate,
  workoutGroups: normalizeWorkoutGroup,
  workoutLogs: validateImportedWorkoutLog,
};

export class ImportSelectionError extends Error {}

function validateImportSelection(data, selected, exercisesById) {
  const muscleGroupIds = new Set(data.muscleGroups.map((group) => group.id));

  if (selected.has("exercises") && data.exercises.some(
    (exercise) => !exercise.isArchived && !muscleGroupIds.has(exercise.muscleGroupId),
  )) {
    throw new ImportSelectionError("import.unknownExerciseGroups");
  }

  if (selected.has("exerciseTemplates") && data.exerciseTemplates.some(
    (template) => !template.isArchived &&
      template.id !== getStandardTemplateId(template.muscleGroupId) &&
      !muscleGroupIds.has(template.muscleGroupId),
  )) {
    throw new ImportSelectionError("import.unknownTemplateGroups");
  }

  if (selected.has("workoutGroups") && data.workoutGroups.some(
    (group) => group.muscleGroupIds.some((id) => !muscleGroupIds.has(id)),
  )) {
    throw new ImportSelectionError("import.unknownTrainingDayGroups");
  }

  if (!exercisesById) {
    return;
  }

  const activeTemplates = data.exerciseTemplates.filter((template) => !template.isArchived);
  if (activeTemplates.some((template) => !Array.isArray(template.exerciseIds))) {
    throw new ImportSelectionError("import.invalidTemplateExercises");
  }

  const hasUnavailableExercises = activeTemplates.some((template) =>
    template.exerciseIds.some((id) => !isAvailableTemplateExercise(exercisesById.get(id), template.muscleGroupId)),
  );
  if (hasUnavailableExercises) {
    const importsBoth = selected.has("exercises") && selected.has("exerciseTemplates");
    throw new ImportSelectionError(importsBoth ? "import.invalidTemplateExercises" : "import.unavailableTemplateExercises");
  }
}

function countWorkoutLogUsage(logs, getIds) {
  const counts = new Map();

  for (const log of logs) {
    for (const id of getIds(log)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  return counts;
}

export async function importAppData(payload, { selectedStores = IMPORT_STORE_NAMES } = {}) {
  const source = getImportDataPayload(payload);
  const selected = new Set(selectedStores);
  const importedStores = IMPORT_STORE_NAMES.filter((storeName) => selected.has(storeName));

  if (!importedStores.length || importedStores.length !== selected.size) {
    throw new ImportSelectionError("import.noSections");
  }

  const isFullImport = importedStores.length === IMPORT_STORE_NAMES.length;
  const importedData = Object.fromEntries(importedStores.map((storeName) => [
    storeName,
    source[storeName].map((record) => {
      const normalized = normalizeImportedRecord(record, storeName);
      return importNormalizers[storeName]?.(normalized) ?? normalized;
    }),
  ]));
  const database = await openAppDatabase();

  try {
    const transaction = database.transaction(STORE_NAMES, "readwrite");
    const done = transactionDone(transaction);

    try {
      const data = { ...importedData };
      const metadataStore = transaction.objectStore("metadata");
      const [metadata, muscleGroups] = await Promise.all([
        isFullImport ? source.metadata : requestToPromise(metadataStore.get("app")),
        requestToPromise(transaction.objectStore("muscleGroups").getAll()),
        ...IMPORT_STORE_NAMES.filter((storeName) => !selected.has(storeName)).map(async (storeName) => {
          data[storeName] = await requestToPromise(transaction.objectStore(storeName).getAll());
        }),
      ]);
      data.muscleGroups = muscleGroups;

      const exercisesById = selected.has("exercises") || selected.has("exerciseTemplates")
        ? new Map(data.exercises.map((exercise) => [exercise.id, exercise]))
        : null;
      if (selected.has("exerciseTemplates")) {
        data.exerciseTemplates = withSystemTemplates(data.exerciseTemplates, exercisesById);
      }
      validateImportSelection(data, selected, exercisesById);

      const storesToWrite = new Set(importedStores);

      if (!isFullImport) {
        for (const [storeName, getIds] of [
          ["exercises", getWorkoutLogExerciseIds],
          ["exerciseTemplates", getWorkoutLogTemplateIds],
        ]) {
          if (selected.has(storeName) || selected.has("workoutLogs")) {
            const counts = countWorkoutLogUsage(data.workoutLogs, getIds);
            data[storeName] = data[storeName].map((record) => ({ ...record, usageCount: counts.get(record.id) ?? 0 }));
            storesToWrite.add(storeName);
          }
        }
      }

      for (const storeName of storesToWrite) {
        const store = transaction.objectStore(storeName);
        if (selected.has(storeName)) {
          store.clear();
        }
        for (const record of data[storeName]) {
          store.put(record);
        }
      }

      const now = new Date().toISOString();
      transaction.objectStore("activeWorkoutSessions").clear();
      metadataStore.put({
        ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
        id: "app",
        schemaVersion: SCHEMA_VERSION,
        createdAt: metadata?.createdAt ?? now,
        updatedAt: now,
        importedAt: now,
      });
      markBackupChange(transaction);
      await done;
    } catch (error) {
      // A request error may already have aborted the transaction.
      try { transaction.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }

    return {
      importedCounts: Object.fromEntries(
        importedStores.map((storeName) => [storeName, importedData[storeName].length]),
      ),
    };
  } finally {
    database.close();
  }
}

export async function saveWorkoutGroup(workoutGroup, { deleteActiveSessions = false } = {}) {
  const normalizedWorkoutGroup = normalizeWorkoutGroup(workoutGroup);

  if (!normalizedWorkoutGroup.id || !normalizedWorkoutGroup.name || !normalizedWorkoutGroup.muscleGroupIds.length) {
    throw new Error("Invalid workout group");
  }

  const database = await openAppDatabase();

  try {
    const [metadata, activeWorkoutSessions] = await Promise.all([
      readMetadata(database),
      deleteActiveSessions ? readStore(database, "activeWorkoutSessions") : Promise.resolve([]),
    ]);
    const storeNames = deleteActiveSessions
      ? ["metadata", "workoutGroups", "activeWorkoutSessions"]
      : ["metadata", "workoutGroups"];
    const transaction = database.transaction(storeNames, "readwrite");
    const done = transactionDone(transaction);
    const now = new Date().toISOString();

    transaction.objectStore("workoutGroups").put(normalizedWorkoutGroup);
    if (deleteActiveSessions) {
      const activeWorkoutSessionStore = transaction.objectStore("activeWorkoutSessions");

      activeWorkoutSessions
        .filter((session) => session.workoutGroupId === normalizedWorkoutGroup.id)
        .forEach((session) => activeWorkoutSessionStore.delete(session.id));
    }
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });

    markBackupChange(transaction);
    await done;
    return normalizedWorkoutGroup;
  } finally {
    database.close();
  }
}

export async function deleteWorkoutGroup(workoutGroupId) {
  const database = await openAppDatabase();

  try {
    const [metadata, workoutGroups, activeWorkoutSessions] = await Promise.all([
      readMetadata(database),
      readStore(database, "workoutGroups"),
      readStore(database, "activeWorkoutSessions"),
    ]);
    const workoutGroup = workoutGroups.find((item) => item.id === workoutGroupId);

    if (!workoutGroup) {
      return { status: "missing" };
    }

    const sessionsToDelete = activeWorkoutSessions.filter(
      (session) => session.workoutGroupId === workoutGroupId,
    );

    const remainingWorkoutGroups = workoutGroups
      .filter((item) => item.id !== workoutGroupId)
      .sort((first, second) => Number(first.orderIndex ?? 0) - Number(second.orderIndex ?? 0))
      .map((item, orderIndex) => normalizeWorkoutGroup({ ...item, orderIndex }));
    const transaction = database.transaction(
      ["metadata", "workoutGroups", "activeWorkoutSessions"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const workoutGroupStore = transaction.objectStore("workoutGroups");
    const activeWorkoutSessionStore = transaction.objectStore("activeWorkoutSessions");
    const now = new Date().toISOString();

    workoutGroupStore.delete(workoutGroupId);
    remainingWorkoutGroups.forEach((item) => workoutGroupStore.put(item));
    sessionsToDelete.forEach((session) => activeWorkoutSessionStore.delete(session.id));
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });

    markBackupChange(transaction);
    await done;
    return { status: "deleted", deletedActiveSessionCount: sessionsToDelete.length };
  } finally {
    database.close();
  }
}

export async function saveExerciseTemplate(template) {
  const database = await openAppDatabase();

  try {
    const transaction = database.transaction(["metadata", "exerciseTemplates"], "readwrite");
    const done = transactionDone(transaction);
    const templateStore = transaction.objectStore("exerciseTemplates");
    const metadataStore = transaction.objectStore("metadata");

    const saveTemplate = Promise.all([
      requestToPromise(templateStore.getAll()),
      requestToPromise(metadataStore.get("app")),
    ]).then(([templates, metadata]) => {
      const existing = templates.find((item) => item.id === template.id);
      const record = normalizeExerciseTemplate({ ...existing, ...template });
      const previousNames = existing && existing.muscleGroupId === record.muscleGroupId
        ? getTemplateNameKeys(existing)
        : [];
      const newNames = getTemplateNameKeys(record).filter((name) => !previousNames.includes(name));
      const hasDuplicateName = newNames.length > 0 && templates.some((item) =>
        item.id !== record.id && !item.isArchived && item.muscleGroupId === record.muscleGroupId &&
        getTemplateNameKeys(item).some((name) => newNames.includes(name)),
      );

      if (hasDuplicateName) {
        return { status: "duplicate" };
      }

      const now = new Date().toISOString();
      templateStore.put(record);
      metadataStore.put({
        ...metadata,
        id: "app",
        schemaVersion: SCHEMA_VERSION,
        createdAt: metadata?.createdAt ?? now,
        updatedAt: now,
      });
      markBackupChange(transaction);
      return { status: "saved" };
    });

    const [result] = await Promise.all([saveTemplate, done]);
    return result;
  } finally {
    database.close();
  }
}

export async function saveExercise(exercise, { updateOnly = false } = {}) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const transaction = database.transaction(["metadata", "exercises"], "readwrite");
    const done = transactionDone(transaction);
    const exerciseStore = transaction.objectStore("exercises");
    const existing = updateOnly ? await requestToPromise(exerciseStore.get(exercise.id)) : null;
    if (updateOnly && (!existing || existing.isArchived)) {
      await done;
      return { status: "missing" };
    }

    exerciseStore.put(normalizeExercise({ ...existing, ...exercise }));
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    markBackupChange(transaction);
    await done;
    return { status: "saved" };
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

    transaction.objectStore("workoutGroups").put(normalizeWorkoutGroup({
      ...workoutGroup,
      selectedTemplateByMuscleGroupId: {
        ...workoutGroup.selectedTemplateByMuscleGroupId,
        [muscleGroupId]: template.id,
      },
    }));
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    markBackupChange(transaction);
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

    markBackupChange(transaction);
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
                isArchived: true,
                archivedAt: new Date().toISOString(),
              })
            : item,
        )
      : templates.filter((item) => item.id !== template.id);
    const activeTemplates = templatesAfterDelete.filter(
      (item) => item.muscleGroupId === template.muscleGroupId && !item.isArchived,
    );
    const fallbackTemplateId =
      activeTemplates.find((item) => item.id === getStandardTemplateId(template.muscleGroupId))?.id ??
      activeTemplates[0]?.id ??
      null;
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

    if (fallbackTemplateId) {
      for (const workoutGroup of workoutGroups) {
        if (workoutGroup.selectedTemplateByMuscleGroupId?.[template.muscleGroupId] !== template.id) {
          continue;
        }

        workoutGroupStore.put(normalizeWorkoutGroup({
          ...workoutGroup,
          selectedTemplateByMuscleGroupId: {
            ...workoutGroup.selectedTemplateByMuscleGroupId,
            [template.muscleGroupId]: fallbackTemplateId,
          },
        }));
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    markBackupChange(transaction);
    await done;

    return { status: shouldArchive ? "archived" : "deleted" };
  } finally {
    database.close();
  }
}

function parseWeightKg(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseReps(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number.parseInt(String(value), 10);
  return Number.isInteger(number) ? number : null;
}

function normalizeCompletedSets(sets = []) {
  return sets
    .map((set, index) => ({
      setNumber: index + 1,
      weightKg: parseWeightKg(set.weightKg),
      reps: parseReps(set.reps),
    }))
    .filter((set) => set.weightKg !== null || set.reps !== null);
}

function normalizeJournalSetEdits(changes) {
  const normalized = new Map();

  for (const [key, sets] of changes) {
    const rows = sets.map(({ weightKg, reps }) => ({
      weightKg: String(weightKg ?? "").trim(),
      reps: String(reps ?? "").trim(),
    }));
    const hasInvalidValue = rows.some(({ weightKg, reps }) => {
      return (weightKg !== "" && (!/^(?:\d+(?:[,.]\d*)?|[,.]\d+)$/.test(weightKg) || parseWeightKg(weightKg) === null)) ||
        (reps !== "" && (!/^\d+$/.test(reps) || !Number.isSafeInteger(Number(reps))));
    });

    if (hasInvalidValue) {
      return null;
    }

    normalized.set(key, normalizeCompletedSets(rows).map((set, index) => ({ ...set, setNumber: index + 1 })));
  }

  return normalized;
}

function updateWorkoutLogExerciseSets(workoutLog, changes) {
  const records = new Map(collectExerciseLogEntries(workoutLog).map((exerciseLog) => [exerciseLog, undefined]));

  if (Array.isArray(workoutLog.exerciseLogs)) {
    for (const exerciseLog of workoutLog.exerciseLogs) {
      records.set(exerciseLog, undefined);
    }
  }

  for (const muscleLog of workoutLog.muscleGroupLogs ?? []) {
    if (Array.isArray(muscleLog.exerciseLogs)) {
      for (const exerciseLog of muscleLog.exerciseLogs) {
        records.set(exerciseLog, muscleLog.muscleGroupId ?? muscleLog.muscleGroup?.id);
      }
    }
  }

  const updated = new Set();
  for (const [exerciseLog, groupId] of records) {
    if (!exerciseLog || typeof exerciseLog !== "object") {
      continue;
    }

    const key = getWorkoutLogExerciseKey(exerciseLog, groupId);
    if (changes.has(key)) {
      exerciseLog.sets = changes.get(key);
      updated.add(key);
    }
  }

  return updated.size === changes.size;
}

export async function saveWorkoutLogSets(originalLog, changes) {
  const normalized = normalizeJournalSetEdits(changes);
  if (!normalized) {
    return { status: "invalid" };
  }

  const database = await openAppDatabase();

  try {
    const transaction = database.transaction(isNativeAndroid ? ["workoutLogs", "metadata"] : "workoutLogs", "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore("workoutLogs");
    const [result] = await Promise.all([
      requestToPromise(store.get(originalLog.id)).then((currentLog) => {
        if (!currentLog) {
          return { status: "missing" };
        }

        if (JSON.stringify(currentLog) !== JSON.stringify(originalLog)) {
          return { status: "changed", workoutLog: currentLog };
        }

        if (!updateWorkoutLogExerciseSets(currentLog, normalized)) {
          throw new Error("Workout exercise missing from log");
        }

        store.put(currentLog);
        markBackupChange(transaction);
        return { status: "saved", workoutLog: currentLog };
      }),
      done,
    ]);

    return result;
  } finally {
    database.close();
  }
}

function getWorkoutLogExerciseIds(log) {
  const exerciseIds = new Set();
  const addExerciseLog = (exerciseLog) => {
    if (typeof exerciseLog?.exerciseId === "string" && exerciseLog.exerciseId) {
      exerciseIds.add(exerciseLog.exerciseId);
    }
  };

  (log.exerciseLogs ?? []).forEach(addExerciseLog);
  (log.muscleGroupLogs ?? []).forEach((muscleGroupLog) => {
    (muscleGroupLog.exerciseLogs ?? []).forEach(addExerciseLog);
  });

  return exerciseIds;
}

function getWorkoutLogTemplateIds(log) {
  const templateIds = new Set();
  const addTemplateId = (templateId) => {
    if (typeof templateId === "string" && templateId) {
      templateIds.add(templateId);
    }
  };

  getTemplateSnapshots(log).forEach((template) => addTemplateId(template?.id ?? template?.templateId));
  (log.muscleGroupLogs ?? []).forEach((muscleGroupLog) => addTemplateId(muscleGroupLog.templateId));
  (log.exerciseLogs ?? []).forEach((exerciseLog) => addTemplateId(exerciseLog.templateId));

  return templateIds;
}

function createWorkoutLogFromSession(session, completedAt) {
  const exerciseLogs = (session.exerciseLogs ?? []).map((exerciseLog) => ({
    exerciseId: exerciseLog.exerciseId,
    exerciseNameSnapshot: exerciseLog.exerciseNameSnapshot,
    plannedExerciseId: exerciseLog.plannedExerciseId ?? exerciseLog.exerciseId,
    plannedExerciseNameSnapshot: exerciseLog.plannedExerciseNameSnapshot ?? exerciseLog.exerciseNameSnapshot,
    muscleGroupId: exerciseLog.muscleGroupId,
    muscleGroupNameSnapshot: exerciseLog.muscleGroupNameSnapshot,
    templateId: exerciseLog.templateId ?? null,
    templateNameSnapshot: exerciseLog.templateNameSnapshot ?? null,
    trackingType: exerciseLog.trackingType ?? "weight_reps",
    isReplacement: Boolean(
      (exerciseLog.plannedExerciseId ?? exerciseLog.exerciseId) !== exerciseLog.exerciseId,
    ),
    replacement: exerciseLog.replacement ?? null,
    sets: normalizeCompletedSets(exerciseLog.sets),
  }));

  return {
    id: session.logId ?? `log-${session.id}`,
    date: completedAt,
    startedAt: session.startedAt ?? completedAt,
    completedAt,
    workoutGroupId: session.workoutGroupId,
    workoutGroupSnapshot: session.workoutGroupSnapshot,
    muscleGroupLogs: (session.muscleGroupSnapshots ?? []).map((muscleGroup) => {
      const groupExerciseLogs = exerciseLogs.filter(
        (exerciseLog) => exerciseLog.muscleGroupId === muscleGroup.id,
      );
      const templateSnapshot = (session.templateSnapshots ?? []).find(
        (template) => template.muscleGroupId === muscleGroup.id,
      );

      return {
        muscleGroupId: muscleGroup.id,
        muscleGroupNameSnapshot: muscleGroup.name,
        templateId: templateSnapshot?.id ?? null,
        templateNameSnapshot: templateSnapshot?.name ?? null,
        exerciseLogs: groupExerciseLogs,
      };
    }),
    templateSnapshots: session.templateSnapshots ?? [],
    exerciseLogs,
  };
}

export async function saveActiveWorkoutSession(session) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const now = new Date().toISOString();
    const transaction = database.transaction(["metadata", "activeWorkoutSessions"], "readwrite");
    const done = transactionDone(transaction);

    transaction.objectStore("activeWorkoutSessions").put({
      ...session,
      status: "active",
      updatedAt: session.updatedAt ?? now,
    });
    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });

    await done;
  } finally {
    database.close();
  }
}

export async function deleteActiveWorkoutSessionsForWorkoutGroup(workoutGroupId) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const activeWorkoutSessions = await readStore(database, "activeWorkoutSessions");
    const sessionsToDelete = activeWorkoutSessions.filter(
      (session) => session.workoutGroupId === workoutGroupId,
    );

    if (!sessionsToDelete.length) {
      return { deletedCount: 0 };
    }

    const now = new Date().toISOString();
    const transaction = database.transaction(["metadata", "activeWorkoutSessions"], "readwrite");
    const done = transactionDone(transaction);
    const sessionStore = transaction.objectStore("activeWorkoutSessions");

    for (const session of sessionsToDelete) {
      sessionStore.delete(session.id);
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });

    await done;
    return { deletedCount: sessionsToDelete.length };
  } finally {
    database.close();
  }
}

export async function finishActiveWorkoutSession(session) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const exercises = await readStore(database, "exercises");
    const templates = await readStore(database, "exerciseTemplates");
    const activeWorkoutSessions = await readStore(database, "activeWorkoutSessions");
    const completedAt = new Date().toISOString();
    const workoutLog = createWorkoutLogFromSession(session, completedAt);
    const usedExerciseIds = new Set((session.exerciseLogs ?? []).map((log) => log.exerciseId).filter(Boolean));
    const usedTemplateIds = new Set((session.templateSnapshots ?? []).map((template) => template.id).filter(Boolean));
    const transaction = database.transaction(
      ["metadata", "activeWorkoutSessions", "workoutLogs", "exercises", "exerciseTemplates"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const exerciseStore = transaction.objectStore("exercises");
    const templateStore = transaction.objectStore("exerciseTemplates");
    const activeSessionStore = transaction.objectStore("activeWorkoutSessions");

    transaction.objectStore("workoutLogs").put(workoutLog);

    for (const activeSession of activeWorkoutSessions) {
      if (activeSession.workoutGroupId === session.workoutGroupId) {
        activeSessionStore.delete(activeSession.id);
      }
    }

    for (const exercise of exercises) {
      if (usedExerciseIds.has(exercise.id)) {
        exerciseStore.put({
          ...exercise,
          usageCount: Number(exercise.usageCount ?? 0) + 1,
        });
      }
    }

    for (const template of templates) {
      if (usedTemplateIds.has(template.id)) {
        templateStore.put({
          ...template,
          usageCount: Number(template.usageCount ?? 0) + 1,
        });
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? completedAt,
      updatedAt: completedAt,
    });

    markBackupChange(transaction);
    await done;
    return workoutLog;
  } finally {
    database.close();
  }
}

export async function deleteWorkoutLog(workoutLogId) {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const workoutLogs = await readStore(database, "workoutLogs");
    const exercises = await readStore(database, "exercises");
    const templates = await readStore(database, "exerciseTemplates");
    const workoutLog = workoutLogs.find((item) => item.id === workoutLogId);

    if (!workoutLog) {
      return { status: "missing" };
    }

    const usedExerciseIds = getWorkoutLogExerciseIds(workoutLog);
    const usedTemplateIds = getWorkoutLogTemplateIds(workoutLog);
    const now = new Date().toISOString();
    const transaction = database.transaction(
      ["metadata", "workoutLogs", "exercises", "exerciseTemplates"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const exerciseStore = transaction.objectStore("exercises");
    const templateStore = transaction.objectStore("exerciseTemplates");

    transaction.objectStore("workoutLogs").delete(workoutLog.id);

    for (const exercise of exercises) {
      if (usedExerciseIds.has(exercise.id) && Number(exercise.usageCount ?? 0) > 0) {
        exerciseStore.put({
          ...exercise,
          usageCount: Math.max(0, Number(exercise.usageCount ?? 0) - 1),
        });
      }
    }

    for (const template of templates) {
      if (usedTemplateIds.has(template.id) && Number(template.usageCount ?? 0) > 0) {
        templateStore.put({
          ...template,
          usageCount: Math.max(0, Number(template.usageCount ?? 0) - 1),
        });
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? now,
      updatedAt: now,
    });

    markBackupChange(transaction);
    await done;

    return {
      status: "deleted",
      exerciseCount: usedExerciseIds.size,
      templateCount: usedTemplateIds.size,
    };
  } finally {
    database.close();
  }
}

export async function clearWorkoutLogs() {
  const database = await openAppDatabase();

  try {
    const metadata = await readMetadata(database);
    const exercises = await readStore(database, "exercises");
    const templates = await readStore(database, "exerciseTemplates");
    const transaction = database.transaction(
      ["metadata", "workoutLogs", "exercises", "exerciseTemplates"],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const exerciseStore = transaction.objectStore("exercises");
    const templateStore = transaction.objectStore("exerciseTemplates");

    transaction.objectStore("workoutLogs").clear();

    for (const exercise of exercises) {
      if (Number(exercise.usageCount ?? 0) > 0) {
        exerciseStore.put({
          ...exercise,
          usageCount: 0,
        });
      }
    }

    for (const template of templates) {
      if (Number(template.usageCount ?? 0) > 0) {
        templateStore.put({
          ...template,
          usageCount: 0,
        });
      }
    }

    transaction.objectStore("metadata").put({
      id: "app",
      schemaVersion: SCHEMA_VERSION,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    markBackupChange(transaction);
    await done;
  } finally {
    database.close();
  }
}
