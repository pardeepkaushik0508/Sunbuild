type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let active = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener(active);
}

function clearSafetyTimer() {
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

/** Start global navigation loading UI (links, router.push, etc.). */
export function startNavigationProgress() {
  if (active) return;
  active = true;
  emit();
  clearSafetyTimer();
  // Failsafe if navigation is cancelled or never settles
  safetyTimer = setTimeout(() => {
    stopNavigationProgress();
  }, 12_000);
}

/** Stop global navigation loading UI once the route has settled. */
export function stopNavigationProgress() {
  if (!active) return;
  active = false;
  clearSafetyTimer();
  emit();
}

export function subscribeNavigationProgress(listener: Listener) {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

export function getNavigationProgress() {
  return active;
}
