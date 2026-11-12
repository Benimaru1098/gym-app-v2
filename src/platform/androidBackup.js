import { BACKUP_DATA_CHANGED, exportAppData, readBackupRevision } from "../data/storage.js";
import { gymCycleAndroid } from "./android.js";

const OFFERED_KEY = "gym-cycle-backup-offered";
const SAVE_DELAY_MS = 600;
const listeners = new Set();
let state = { loading: true, choosing: false, saving: false, fileName: "", savedAt: 0, revision: "", error: "" };
let timer;
let currentWrite;
let checkAgain = false;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((notify) => notify());
}

function applyStatus(status) {
  setState({
    loading: false,
    fileName: status.fileName ?? "",
    savedAt: status.savedAt ?? 0,
    revision: status.revision ?? "",
    error: status.fileName && !status.writable ? "writeFailed" : "",
  });
}

export function getBackupState() {
  return state;
}

export function subscribeToBackupState(notify) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function takeBackupSetupOffer() {
  try {
    if (localStorage.getItem(OFFERED_KEY)) return false;
    localStorage.setItem(OFFERED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function scheduleWrite() {
  if (!state.fileName) return;
  clearTimeout(timer);
  timer = setTimeout(updateBackup, SAVE_DELAY_MS);
}

export function updateBackup() {
  clearTimeout(timer);
  if (!state.fileName || state.choosing) return;
  if (currentWrite) {
    checkAgain = true;
    return currentWrite;
  }

  currentWrite = (async () => {
    const revision = await readBackupRevision();
    if (revision === state.revision && state.error !== "writeFailed") return;

    setState({ saving: true, error: "" });
    const snapshot = await exportAppData();
    applyStatus(await gymCycleAndroid.writeBackup({ revision, content: JSON.stringify(snapshot) }));
  })().catch(() => {
    setState({ error: "writeFailed" });
  }).finally(() => {
    currentWrite = null;
    if (state.saving) setState({ saving: false });
    if (checkAgain) {
      checkAgain = false;
      scheduleWrite();
    }
  });
  return currentWrite;
}

export async function chooseBackupFile() {
  if (state.loading || state.choosing) return;

  setState({ choosing: true });
  try {
    await currentWrite;
    const status = await gymCycleAndroid.selectBackupFile();
    if (status?.fileName) applyStatus(status);
  } catch {
    setState({ error: "chooseFailed" });
  } finally {
    setState({ choosing: false });
    await updateBackup();
  }
}

export function startAutomaticBackup() {
  let stopped = false;
  window.addEventListener(BACKUP_DATA_CHANGED, scheduleWrite);
  document.addEventListener("visibilitychange", updateBackup);
  gymCycleAndroid.getBackupStatus().then((status) => {
    if (stopped) return;
    applyStatus(status);
    updateBackup();
  }).catch(() => {
    if (!stopped) setState({ loading: false, error: "statusFailed" });
  });

  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener(BACKUP_DATA_CHANGED, scheduleWrite);
    document.removeEventListener("visibilitychange", updateBackup);
  };
}
