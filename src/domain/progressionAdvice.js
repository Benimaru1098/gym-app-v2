const HISTORY_LIMIT = 5;
const MIN_TARGET_REPS = 8;
const MAX_TARGET_REPS = 12;
const LONG_BREAK_DAYS = 21;
const SAME_WEIGHT_EPSILON = 0.001;

const INSUFFICIENT_HISTORY_ADVICE =
  "Данных не достаточно для совета, выполни это упражнение хотя бы 2 раза.";

function parseWeightKg(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseReps(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  const number = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(number) ? number : null;
}

function getWorkoutLogDate(log) {
  const date = new Date(log?.date ?? log?.completedAt ?? 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameWeight(first, second) {
  return Math.abs(first - second) < SAME_WEIGHT_EPSILON;
}

function normalizeSet(set, index) {
  const weightKg = parseWeightKg(set?.weightKg);
  const reps = parseReps(set?.reps);

  if (weightKg === null || reps === null || weightKg <= 0 || reps <= 0) {
    return null;
  }

  return {
    setNumber: Number(set?.setNumber ?? index + 1),
    weightKg,
    reps,
  };
}

function normalizeSets(sets) {
  return (sets ?? [])
    .map(normalizeSet)
    .filter(Boolean);
}

function getRootExerciseLogs(log) {
  return Array.isArray(log?.exerciseLogs) ? log.exerciseLogs : [];
}

function getNestedExerciseLogs(log) {
  const entries = [];

  for (const muscleLog of log?.muscleGroupLogs ?? []) {
    if (!Array.isArray(muscleLog?.exerciseLogs)) {
      continue;
    }

    for (const exerciseLog of muscleLog.exerciseLogs) {
      entries.push({
        ...exerciseLog,
        muscleGroupId: exerciseLog.muscleGroupId ?? muscleLog.muscleGroupId,
      });
    }
  }

  return entries;
}

function getExerciseLogsForLog(log) {
  const rootLogs = getRootExerciseLogs(log);
  return rootLogs.length ? rootLogs : getNestedExerciseLogs(log);
}

function getMuscleExerciseLogs(log, muscleGroupId, rootLogs) {
  const nestedMuscleLog = (log?.muscleGroupLogs ?? []).find(
    (muscleLog) =>
      muscleLog?.muscleGroupId === muscleGroupId ||
      muscleLog?.muscleGroup?.id === muscleGroupId,
  );

  if (Array.isArray(nestedMuscleLog?.exerciseLogs)) {
    return nestedMuscleLog.exerciseLogs;
  }

  return rootLogs.filter((entry) => entry?.muscleGroupId === muscleGroupId);
}

function calculateEpley(set) {
  return set.weightKg * (1 + set.reps / 30);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(values, predicate) {
  return values.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

function hasSharpRepsDropAtSameWeight(sets) {
  const setsByWeight = new Map();

  for (const set of sets) {
    const key = set.weightKg.toFixed(3);
    const group = setsByWeight.get(key) ?? [];
    group.push(set);
    setsByWeight.set(key, group);
  }

  for (const group of setsByWeight.values()) {
    for (let index = 1; index < group.length; index += 1) {
      if (group[index - 1].reps - group[index].reps >= 3) {
        return true;
      }
    }
  }

  return false;
}

function summarizePerformance(log, exerciseLog, date, rootLogs) {
  const sets = normalizeSets(exerciseLog?.sets);

  if (!sets.length) {
    return null;
  }

  const muscleGroupId = exerciseLog.muscleGroupId;
  const muscleExerciseLogs = getMuscleExerciseLogs(log, muscleGroupId, rootLogs);
  const muscleExerciseIndex = muscleExerciseLogs.findIndex(
    (entry) => entry === exerciseLog || entry?.exerciseId === exerciseLog.exerciseId,
  );
  const maxWeight = Math.max(...sets.map((set) => set.weightKg));
  const workingSets = sets.filter((set) => set.weightKg >= maxWeight * 0.85);
  const workingReps = workingSets.map((set) => set.reps);
  const bestSet = [...sets].sort((first, second) => calculateEpley(second) - calculateEpley(first))[0];

  return {
    date,
    exerciseLog,
    sets,
    workingSets,
    workingWeight: maxWeight,
    workingRepsAverage: average(workingReps),
    workingRepsMin: Math.min(...workingReps),
    workingRepsMax: Math.max(...workingReps),
    bestSet,
    bestEpley: calculateEpley(bestSet),
    hasSharpDrop: hasSharpRepsDropAtSameWeight(workingSets),
    muscleExerciseIndex: muscleExerciseIndex >= 0 ? muscleExerciseIndex + 1 : null,
  };
}

function collectExerciseHistory(data, exerciseId) {
  return [...(data?.workoutLogs ?? [])]
    .map((log) => {
      const date = getWorkoutLogDate(log);

      if (!date) {
        return null;
      }

      const rootLogs = getExerciseLogsForLog(log);
      const exerciseLog = rootLogs.find((entry) => entry?.exerciseId === exerciseId);

      if (!exerciseLog) {
        return null;
      }

      return summarizePerformance(log, exerciseLog, date, rootLogs);
    })
    .filter(Boolean)
    .sort((first, second) => second.date.getTime() - first.date.getTime())
    .slice(0, HISTORY_LIMIT);
}

function getCurrentExercisePosition(session, exerciseIndex, exerciseLog) {
  const muscleExerciseIndex = (session?.exerciseLogs ?? [])
    .filter((entry) => entry?.muscleGroupId === exerciseLog?.muscleGroupId)
    .findIndex((entry) => entry === exerciseLog);

  return {
    muscleExerciseIndex: muscleExerciseIndex >= 0 ? muscleExerciseIndex + 1 : null,
  };
}

function roundToQuarter(value) {
  return Number((Math.round(value * 4) / 4).toFixed(2));
}

function inferStepFromWeights(weights) {
  const sortedWeights = weights
    .filter((weight) => weight > 0)
    .sort((first, second) => first - second);
  const uniqueWeights = [];

  for (const weight of sortedWeights) {
    if (!uniqueWeights.some((item) => sameWeight(item, weight))) {
      uniqueWeights.push(weight);
    }
  }

  const stepCounts = new Map();

  for (let index = 1; index < uniqueWeights.length; index += 1) {
    const diff = roundToQuarter(uniqueWeights[index] - uniqueWeights[index - 1]);

    if (diff <= 0 || diff > 20) {
      continue;
    }

    stepCounts.set(diff, (stepCounts.get(diff) ?? 0) + 1);
  }

  const inferredStepEntry = [...stepCounts.entries()]
    .filter(([step]) => step >= 0.5)
    .sort((first, second) => second[1] - first[1] || first[0] - second[0])[0];

  if (!inferredStepEntry) {
    return null;
  }

  const [step, count] = inferredStepEntry;
  return count >= 2 || step <= 5 ? step : null;
}

function inferWeightStep(history, workingWeight) {
  const inferredStep = inferStepFromWeights(
    history.map((performance) => performance.workingWeight),
  );

  if (inferredStep) {
    return inferredStep;
  }

  return workingWeight <= 15 ? 1 : 2.5;
}

function roundWeightToStep(weight, step) {
  return Number((Math.round(weight / step) * step).toFixed(2));
}

function getNextWeight(workingWeight, step) {
  const roundedWeight = roundWeightToStep(workingWeight, step);
  return Number((roundedWeight + step).toFixed(2));
}

function getPreviousWeight(workingWeight, step) {
  const roundedWeight = roundWeightToStep(workingWeight, step);
  return Math.max(step, Number((roundedWeight - step).toFixed(2)));
}

function formatWeight(weight) {
  return Number.isInteger(weight) ? String(weight) : String(Number(weight.toFixed(2)));
}

function getIncreaseAdvice(performance, step) {
  const nextWeight = getNextWeight(performance.workingWeight, step);
  const diff = Number((nextWeight - performance.workingWeight).toFixed(2));

  return `Попробуй ${formatWeight(nextWeight)} кг (+${formatWeight(diff)} кг) в рабочих подходах на 8–10 повторов.`;
}

function isLongBreak(lastPerformance, now) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const daysSinceLast = (nowDate.getTime() - lastPerformance.date.getTime()) / 86400000;

  return daysSinceLast >= LONG_BREAK_DAYS;
}

function isCurrentPositionMuchLater(currentPosition, lastPerformance) {
  return (
    currentPosition.muscleExerciseIndex !== null &&
    lastPerformance.muscleExerciseIndex !== null &&
    currentPosition.muscleExerciseIndex >= 3 &&
    currentPosition.muscleExerciseIndex - lastPerformance.muscleExerciseIndex >= 2
  );
}

function isCurrentPositionMuchEarlier(currentPosition, lastPerformance) {
  return (
    currentPosition.muscleExerciseIndex !== null &&
    lastPerformance.muscleExerciseIndex !== null &&
    currentPosition.muscleExerciseIndex <= 2 &&
    lastPerformance.muscleExerciseIndex - currentPosition.muscleExerciseIndex >= 2
  );
}

function wasLastWorkoutNoticeablyWeak(history) {
  if (history.length < 3) {
    return false;
  }

  const last = history[0];
  const previousPerformance = history[1];

  if (
    wasWeightRecentlyRaised(last, previousPerformance) &&
    last.workingRepsAverage >= MIN_TARGET_REPS
  ) {
    return false;
  }

  const previous = history.slice(1, 3);
  const previousAverageEpley = average(previous.map((performance) => performance.bestEpley));
  const previousAverageReps = average(previous.map((performance) => performance.workingRepsAverage));
  const previousIsStable = Math.abs(previous[0].bestEpley - previous[1].bestEpley) / previousAverageEpley < 0.08;

  return (
    previousIsStable &&
    (last.bestEpley < previousAverageEpley * 0.9 ||
      last.workingRepsAverage <= previousAverageReps - 3)
  );
}

function hasRepeatedBelowRange(history) {
  if (history.length < 2) {
    return false;
  }

  const [last, previous] = history;

  return (
    last.workingRepsMax < MIN_TARGET_REPS &&
    previous.workingRepsMax < MIN_TARGET_REPS &&
    last.bestEpley <= previous.bestEpley * 1.01
  );
}

function wasWeightRecentlyRaised(last, previous) {
  return previous && last.workingWeight > previous.workingWeight + SAME_WEIGHT_EPSILON;
}

function wasWeightRaisedIntoTargetRange(last, previous) {
  return (
    wasWeightRecentlyRaised(last, previous) &&
    last.workingRepsAverage >= MIN_TARGET_REPS &&
    last.workingRepsAverage < 11.5
  );
}

function hasUnstableUpperRange(performance) {
  return (
    performance.workingRepsMax >= MAX_TARGET_REPS &&
    (performance.workingRepsMin <= MIN_TARGET_REPS || performance.workingRepsMax - performance.workingRepsMin >= 4)
  );
}

function isUpperRangeStable(history) {
  if (history.length < 2) {
    return false;
  }

  const [last, previous] = history;
  const sameWorkingWeight = sameWeight(last.workingWeight, previous.workingWeight);

  return (
    sameWorkingWeight &&
    isUpperRangeReached(last) &&
    isUpperRangeReached(previous)
  );
}

function isUpperRangeReached(performance) {
  const strongSetCount = countBy(performance.workingSets, (set) => set.reps >= 11);
  const neededStrongSets = Math.ceil(performance.workingSets.length / 2);

  return strongSetCount >= neededStrongSets && performance.workingRepsMin >= MIN_TARGET_REPS;
}

function isResultFalling(history) {
  if (history.length < 3) {
    return false;
  }

  const [last, previous, beforePrevious] = history;

  return (
    last.bestEpley < previous.bestEpley * 0.985 &&
    previous.bestEpley < beforePrevious.bestEpley * 0.985
  );
}

function isResultStagnant(history) {
  if (history.length < 3) {
    return false;
  }

  const recent = history.slice(0, 3);
  const sameWorkingWeight = recent.every((performance) =>
    sameWeight(performance.workingWeight, recent[0].workingWeight),
  );
  const repsSpread =
    Math.max(...recent.map((performance) => performance.workingRepsAverage)) -
    Math.min(...recent.map((performance) => performance.workingRepsAverage));
  const epleySpread =
    Math.max(...recent.map((performance) => performance.bestEpley)) -
    Math.min(...recent.map((performance) => performance.bestEpley));

  return sameWorkingWeight && repsSpread < 0.75 && epleySpread < recent[0].bestEpley * 0.015;
}

function isInWorkingRepRange(performance) {
  return (
    performance.workingRepsAverage >= MIN_TARGET_REPS &&
    performance.workingRepsAverage < 11.5
  );
}

export function buildProgressionAdvice({ data, session, exerciseIndex, now = new Date() }) {
  const exerciseLog = session?.exerciseLogs?.[exerciseIndex];

  if (!exerciseLog?.exerciseId) {
    return { text: INSUFFICIENT_HISTORY_ADVICE, type: "insufficient-history" };
  }

  const history = collectExerciseHistory(data, exerciseLog.exerciseId);

  if (history.length < 2) {
    return { text: INSUFFICIENT_HISTORY_ADVICE, type: "insufficient-history" };
  }

  const last = history[0];
  const previous = history[1];
  const currentPosition = getCurrentExercisePosition(session, exerciseIndex, exerciseLog);
  const step = inferWeightStep(history, last.workingWeight);
  const previousWeight = getPreviousWeight(last.workingWeight, step);

  if (isLongBreak(last, now)) {
    return {
      text: `Был большой перерыв. Повтори прошлый вес или снизь до ${formatWeight(previousWeight)} кг.`,
      type: "long-break",
    };
  }

  if (isCurrentPositionMuchLater(currentPosition, last)) {
    return {
      text: "Сегодня упражнение стоит позже, поэтому закрепи текущий вес.",
      type: "later-position",
    };
  }

  if (wasWeightRecentlyRaised(last, previous) && last.workingRepsMax <= 5) {
    return {
      text: "Вернись к прошлому весу и снова добери повторы.",
      type: "increase-too-heavy",
    };
  }

  if (wasWeightRaisedIntoTargetRange(last, previous)) {
    return {
      text: "Оставь текущий вес и попробуй добавить 1 повтор.",
      type: "increase-normal-drop",
    };
  }

  if (wasLastWorkoutNoticeablyWeak(history)) {
    return {
      text: "В прошлый раз результат просел. Начни с последнего веса, на котором получалось 8–10 повторов.",
      type: "last-workout-weaker",
    };
  }

  if (hasRepeatedBelowRange(history)) {
    return {
      text: "Вес пока тяжёлый. Вернись к нагрузке, с которой получится 8–10 повторов.",
      type: "repeated-below-range",
    };
  }

  if (last.workingRepsMax <= 5) {
    return {
      text: "Лучше вернуться к весу, с которым получится 8–10 повторов.",
      type: "strongly-below-range",
    };
  }

  if (last.workingRepsMax <= 7) {
    return {
      text: "Оставь текущий рабочий вес и попробуй выйти хотя бы на 8 повторов.",
      type: "below-range",
    };
  }

  if (last.hasSharpDrop) {
    return {
      text: "Попробуй дольше отдыхать между тяжёлыми подходами или не доводить первый тяжёлый подход до полного отказа.",
      type: "sharp-set-drop",
    };
  }

  if (hasUnstableUpperRange(last)) {
    return {
      text: "Оставь этот вес и попробуй сделать тяжёлые подходы ровнее, хотя бы 10 повторов.",
      type: "unstable-upper-range",
    };
  }

  if (isUpperRangeStable(history)) {
    return {
      text: getIncreaseAdvice(last, step),
      type: "stable-upper-range",
    };
  }

  if (isUpperRangeReached(last)) {
    return {
      text: "Верх диапазона уже близко. Повтори текущие показатели и закрепи результат.",
      type: "upper-range-reached",
    };
  }

  if (isResultFalling(history)) {
    return {
      text: "Повтори прошлый вес или снизь на один шаг, если снова не получится выйти к 8 повторениям.",
      type: "falling-result",
    };
  }

  if (isResultStagnant(history)) {
    return {
      text: "Оставь вес и попробуй добавить 1 повтор хотя бы в одном тяжёлом подходе.",
      type: "stagnant-result",
    };
  }

  if (isInWorkingRepRange(last)) {
    return {
      text: "Оставь текущий вес и попробуй добавить 1 повтор.",
      type: "working-range",
    };
  }

  if (isCurrentPositionMuchEarlier(currentPosition, last)) {
    return {
      text: "Сегодня упражнение стоит раньше, попробуй улучшить результат.",
      type: "earlier-position",
    };
  }

  return {
    text: "Повтори текущий вес и ориентируйся на ровные рабочие подходы.",
    type: "default",
  };
}
