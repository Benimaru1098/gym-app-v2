import { initialData } from "../data/seed.js";
import russianTechniques from "../data/exercise-techniques.json" with { type: "json" };
import englishExercises from "./exercises.en.json" with { type: "json" };
import { t } from "./index.js";

const EXERCISES_BY_LOCALE = new Map([["en", new Map(Object.entries(englishExercises))]]);
const RUSSIAN_DESCRIPTIONS = new Map(
  Object.entries(russianTechniques).map(([id, steps]) => [id, steps.join("\n")]),
);
const EXERCISE_NAMES = new Map(initialData.exercises.map(({ id, name }) => [id, name]));
const MUSCLE_NAMES = new Map(initialData.muscleGroups.map(({ id, name }) => [id, name]));
const TEMPLATE_NAMES = new Map(initialData.exerciseTemplates.map(({ id, name }) => [id, name]));
const WORKOUT_MUSCLES = new Map(initialData.workoutGroups.map(({ id, muscleGroupIds }) => [id, muscleGroupIds]));
const TEMPLATE_KEYS = new Map([
  ["Стандарт", "standard"],
  ["Альтернатива", "alternative"],
  ["Дополнительный", "accessory"],
  ["Жимовой", "pressFocused"],
  ["Лёгкий", "light"],
]);

export function localizeExerciseName(id, name, locale = "ru") {
  if (name !== EXERCISE_NAMES.get(id)) {
    return name;
  }

  return EXERCISES_BY_LOCALE.get(locale)?.get(id)?.name ?? name;
}

export function localizeMuscleGroupName(id, name, locale = "ru") {
  return locale !== "ru" && MUSCLE_NAMES.has(id) && name === MUSCLE_NAMES.get(id)
    ? t(`domain:muscleGroups.${id}`, { lng: locale })
    : name;
}

export function localizeTemplateName(id, name, locale = "ru") {
  const translationKey = TEMPLATE_KEYS.get(name);
  return locale !== "ru" && translationKey && name === TEMPLATE_NAMES.get(id)
    ? t(`domain:templateNames.${translationKey}`, { lng: locale })
    : name;
}

export function localizeWorkoutName(id, name, muscleGroupIds, locale = "ru") {
  if (locale === "ru") {
    return name;
  }

  const muscleIds = Array.isArray(muscleGroupIds) && muscleGroupIds.length
    ? muscleGroupIds
    : WORKOUT_MUSCLES.get(id);
  if (!muscleIds?.length) {
    return name;
  }

  const names = muscleIds.map((muscleId) => MUSCLE_NAMES.get(muscleId));
  if (names.some((muscleName) => !muscleName) || names.join(" + ") !== name) {
    return name;
  }

  return names.map((muscleName, index) => localizeMuscleGroupName(muscleIds[index], muscleName, locale)).join(" + ");
}

export function localizeExercise(exercise, locale = "ru") {
  if (!exercise || locale === "ru") {
    return exercise;
  }

  const { id, name, techniqueDescription } = exercise;
  const storedDefault = RUSSIAN_DESCRIPTIONS.get(id);
  const localizedSteps = EXERCISES_BY_LOCALE.get(locale)?.get(id)?.steps;
  return {
    ...exercise,
    name: localizeExerciseName(id, name, locale),
    techniqueDescription: storedDefault !== undefined && techniqueDescription === storedDefault && localizedSteps
      ? localizedSteps.join("\n")
      : techniqueDescription,
  };
}

export function getStoredTechniqueDescription(id, description, locale = "ru") {
  const localizedSteps = EXERCISES_BY_LOCALE.get(locale)?.get(id)?.steps;
  if (localizedSteps && typeof description === "string" && description.trim() === localizedSteps.join("\n")) {
    return RUSSIAN_DESCRIPTIONS.get(id) ?? description;
  }

  return description;
}

export function localizeAppData(data, locale = "ru") {
  if (!data || locale === "ru") {
    return data;
  }

  return {
    ...data,
    locale,
    muscleGroups: data.muscleGroups.map((group) => ({
      ...group,
      name: localizeMuscleGroupName(group.id, group.name, locale),
    })),
    exercises: data.exercises.map((exercise) => localizeExercise(exercise, locale)),
    exerciseTemplates: data.exerciseTemplates.map((template) => ({
      ...template,
      name: localizeTemplateName(template.id, template.name, locale),
    })),
    workoutGroups: data.workoutGroups.map((group) => ({
      ...group,
      storedName: group.name,
      name: localizeWorkoutName(group.id, group.name, group.muscleGroupIds, locale),
    })),
  };
}
