/** Client + shared key for idle session last-activity tracking. */
export const SESSION_LAST_ACTIVE_KEY = "sunbuild:session:lastActiveAt";

export type SessionLastActiveStored = {
  userId: string;
  at: number;
};

export function readSessionLastActive(): SessionLastActiveStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_LAST_ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionLastActiveStored;
    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.at !== "number" ||
      !Number.isFinite(parsed.at) ||
      parsed.at <= 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSessionLastActive(userId: string, at: number) {
  if (typeof window === "undefined") return;
  try {
    const payload: SessionLastActiveStored = { userId, at };
    window.localStorage.setItem(SESSION_LAST_ACTIVE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSessionLastActive() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
  } catch {
    // ignore
  }
}
