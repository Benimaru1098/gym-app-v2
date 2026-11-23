const key = "gymbe-tour-pending";

export function scheduleTourOffer() {
  try { localStorage.setItem(key, "1"); } catch {}
}

export function takeTourOffer() {
  try {
    if (!localStorage.getItem(key)) return false;
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
