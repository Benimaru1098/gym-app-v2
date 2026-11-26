const tourPendingKey = "gymbe-tour-pending";
const workoutTourSeenKey = "gymbe-workout-learning-seen";
let workoutTourOffered = false;

export function scheduleTourOffer() {
  // Called after seeding a new database, including after the old one was deleted.
  workoutTourOffered = false;
  try {
    localStorage.removeItem(workoutTourSeenKey);
    localStorage.setItem(tourPendingKey, "1");
  } catch {}
}

export function takeTourOffer() {
  try {
    if (!localStorage.getItem(tourPendingKey)) return false;
    localStorage.removeItem(tourPendingKey);
    return true;
  } catch { return false; }
}

export function hasWorkoutLearningOffer() {
  if (workoutTourOffered) return false;

  try {
    return !localStorage.getItem(workoutTourSeenKey);
  } catch { return true; }
}

export function takeWorkoutLearningOffer() {
  if (!hasWorkoutLearningOffer()) return false;

  workoutTourOffered = true;
  try { localStorage.setItem(workoutTourSeenKey, "1"); } catch {}
  return true;
}
