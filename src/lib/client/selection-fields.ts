import type { Priority, SelectionSection } from "@prisma/client";

/**
 * SelectionSection.dueDate / priority exist in schema + SQLite after `db push`.
 * Prisma Client typings may lag when `prisma generate` is blocked by a locked
 * query-engine DLL (common on Windows while `next dev` is running).
 */
export type SelectionSectionClientFields = {
  dueDate: Date | null;
  priority: Priority;
};

export function selectionClientFields(
  section: Pick<SelectionSection, "id"> & Record<string, unknown>
): SelectionSectionClientFields {
  const dueDate =
    section.dueDate instanceof Date
      ? section.dueDate
      : typeof section.dueDate === "string"
        ? new Date(section.dueDate)
        : null;
  const raw = String(section.priority ?? "MEDIUM").toUpperCase();
  const priority =
    raw === "HIGH" || raw === "LOW" || raw === "MEDIUM"
      ? (raw as Priority)
      : ("MEDIUM" as Priority);
  return { dueDate, priority };
}
