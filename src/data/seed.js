export const SCHEMA_VERSION = 1;

export const TRACKING_TYPES = Object.freeze({
  WEIGHT_REPS: "weight_reps",
});

const exerciseIdsByMuscleGroup = {
  chest: [
    "ex-chest-butterfly",
    "ex-chest-bench-press",
    "ex-chest-dumbbell-press",
    "ex-chest-crossover",
  ],
  biceps: [
    "ex-biceps-barbell-curl",
    "ex-biceps-dumbbell-curl",
    "ex-biceps-scott-bench",
    "ex-biceps-hammer-curl",
  ],
  back: [
    "ex-back-lat-pulldown",
    "ex-back-seated-row",
    "ex-back-dumbbell-row",
    "ex-back-hyperextension",
  ],
  triceps: [
    "ex-triceps-dips",
    "ex-triceps-french-press",
    "ex-triceps-cable-pushdown",
    "ex-triceps-overhead-extension",
  ],
  legs: [
    "ex-legs-extension",
    "ex-legs-curl",
    "ex-legs-press",
    "ex-legs-calf-raise",
  ],
  shoulders: [
    "ex-shoulders-overhead-press",
    "ex-shoulders-lateral-raise",
    "ex-shoulders-rear-delt-raise",
    "ex-shoulders-shrugs",
  ],
};

export const initialData = {
  metadata: {
    id: "app",
    schemaVersion: SCHEMA_VERSION,
    createdAt: null,
    updatedAt: null,
  },
  muscleGroups: [
    { id: "chest", name: "Грудь", sortOrder: 10 },
    { id: "biceps", name: "Бицепс", sortOrder: 20 },
    { id: "back", name: "Спина", sortOrder: 30 },
    { id: "triceps", name: "Трицепс", sortOrder: 40 },
    { id: "legs", name: "Ноги", sortOrder: 50 },
    { id: "shoulders", name: "Плечи", sortOrder: 60 },
  ],
  exercises: [
    {
      id: "ex-chest-butterfly",
      name: "Бабочка",
      muscleGroupId: "chest",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-chest-bench-press",
      name: "Жим лёжа",
      muscleGroupId: "chest",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-chest-dumbbell-press",
      name: "Жим гантелей",
      muscleGroupId: "chest",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-chest-crossover",
      name: "Кроссовер",
      muscleGroupId: "chest",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-biceps-barbell-curl",
      name: "Подъём штанги",
      muscleGroupId: "biceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-biceps-dumbbell-curl",
      name: "Сгибания гантелей",
      muscleGroupId: "biceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-biceps-scott-bench",
      name: "Скамья Скотта",
      muscleGroupId: "biceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-biceps-hammer-curl",
      name: "Молотки",
      muscleGroupId: "biceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-back-lat-pulldown",
      name: "Тяга верхнего блока",
      muscleGroupId: "back",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-back-seated-row",
      name: "Тяга нижнего блока",
      muscleGroupId: "back",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-back-dumbbell-row",
      name: "Тяга гантели",
      muscleGroupId: "back",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-back-hyperextension",
      name: "Гиперэкстензия",
      muscleGroupId: "back",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-triceps-dips",
      name: "Брусья",
      muscleGroupId: "triceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-triceps-french-press",
      name: "Французский жим",
      muscleGroupId: "triceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-triceps-cable-pushdown",
      name: "Разгибание блока",
      muscleGroupId: "triceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-triceps-overhead-extension",
      name: "Разгибание из-за головы",
      muscleGroupId: "triceps",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-legs-extension",
      name: "Разгибание ног",
      muscleGroupId: "legs",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-legs-curl",
      name: "Сгибание ног",
      muscleGroupId: "legs",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-legs-press",
      name: "Жим ногами",
      muscleGroupId: "legs",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-legs-calf-raise",
      name: "Икры",
      muscleGroupId: "legs",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-shoulders-overhead-press",
      name: "Жим вверх",
      muscleGroupId: "shoulders",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-shoulders-lateral-raise",
      name: "Махи в стороны",
      muscleGroupId: "shoulders",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-shoulders-rear-delt-raise",
      name: "Махи назад",
      muscleGroupId: "shoulders",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
    {
      id: "ex-shoulders-shrugs",
      name: "Шраги",
      muscleGroupId: "shoulders",
      trackingType: TRACKING_TYPES.WEIGHT_REPS,
      isArchived: false,
    },
  ],
  exerciseTemplates: [
    {
      id: "tpl-chest-standard",
      muscleGroupId: "chest",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.chest,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
    {
      id: "tpl-biceps-standard",
      muscleGroupId: "biceps",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.biceps,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
    {
      id: "tpl-back-standard",
      muscleGroupId: "back",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.back,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
    {
      id: "tpl-triceps-standard",
      muscleGroupId: "triceps",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.triceps,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
    {
      id: "tpl-legs-standard",
      muscleGroupId: "legs",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.legs,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
    {
      id: "tpl-shoulders-standard",
      muscleGroupId: "shoulders",
      name: "Стандарт",
      exerciseIds: exerciseIdsByMuscleGroup.shoulders,
      isDefault: true,
      isArchived: false,
      isSystem: true,
      usageCount: 0,
    },
  ],
  workoutGroups: [
    {
      id: "wg-chest-biceps",
      name: "Грудь + Бицепс",
      muscleGroupIds: ["chest", "biceps"],
      selectedTemplateByMuscleGroupId: {
        chest: "tpl-chest-standard",
        biceps: "tpl-biceps-standard",
      },
      orderIndex: 0,
    },
    {
      id: "wg-back-triceps",
      name: "Спина + Трицепс",
      muscleGroupIds: ["back", "triceps"],
      selectedTemplateByMuscleGroupId: {
        back: "tpl-back-standard",
        triceps: "tpl-triceps-standard",
      },
      orderIndex: 1,
    },
    {
      id: "wg-legs-shoulders",
      name: "Ноги + Плечи",
      muscleGroupIds: ["legs", "shoulders"],
      selectedTemplateByMuscleGroupId: {
        legs: "tpl-legs-standard",
        shoulders: "tpl-shoulders-standard",
      },
      orderIndex: 2,
    },
  ],
  workoutLogs: [],
};

export function createInitialData() {
  const now = new Date().toISOString();
  const data = JSON.parse(JSON.stringify(initialData));

  data.metadata.createdAt = now;
  data.metadata.updatedAt = now;

  return data;
}
