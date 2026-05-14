export const STANDARD_TEMPLATE_ID_BY_MUSCLE_GROUP_ID = Object.freeze({
  chest: "tpl-chest-standard",
  biceps: "tpl-biceps-standard",
  back: "tpl-back-standard",
  triceps: "tpl-triceps-standard",
  legs: "tpl-legs-standard",
  shoulders: "tpl-shoulders-standard",
});

export const STANDARD_TEMPLATE_NAME = "Стандарт";

export function getStandardTemplateId(muscleGroupId) {
  return STANDARD_TEMPLATE_ID_BY_MUSCLE_GROUP_ID[muscleGroupId] ?? null;
}

export function isStandardTemplate(template) {
  return Boolean(template?.id && template.id === getStandardTemplateId(template.muscleGroupId));
}

export function isProtectedTemplate(template) {
  return Boolean(template?.isSystem || isStandardTemplate(template));
}
