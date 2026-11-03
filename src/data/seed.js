import catalog from "./seed-catalog.json" with { type: "json" };

export const SCHEMA_VERSION = 1;

export const TRACKING_TYPES = Object.freeze({
  WEIGHT_REPS: "weight_reps",
});

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
  exercises: catalog.exercises,
  exerciseTemplates: catalog.exerciseTemplates,
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
