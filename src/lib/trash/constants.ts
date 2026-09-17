/** Soft-deleted records stay in Trash this many days before auto-purge. */
export const TRASH_RETENTION_DAYS = 30;

export function trashPurgeDeadline(deletedAt: Date): Date {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
  return d;
}

export function daysLeftInTrash(deletedAt: Date, now = new Date()): number {
  const ms = trashPurgeDeadline(deletedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Prisma where-clause fragment: only non-trashed rows. */
export const notDeleted = { deletedAt: null } as const;
