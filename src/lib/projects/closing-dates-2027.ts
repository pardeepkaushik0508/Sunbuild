/**
 * Deterministic 2027 closing-date mapping.
 * Reruns produce the same date for the same project id.
 */

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable date in 2027 for a project id. Spreads Jan–Dec. */
export function closingDateForProjectId(projectId: string): Date {
  const h = hashId(projectId);
  const month = h % 12; // 0-11
  const day = (h % MONTH_DAYS[month]!) + 1;
  return new Date(Date.UTC(2027, month, day, 12, 0, 0));
}

export function yearOfDate(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

export function isYear2027(value: Date | string | null | undefined): boolean {
  return yearOfDate(value) === 2027;
}
