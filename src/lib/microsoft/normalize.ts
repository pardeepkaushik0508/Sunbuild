import type { NormalizedMicrosoftTodoTask } from "@/lib/microsoft/types";

/** Raw Graph todoTask subset we care about. */
export type GraphTodoTask = {
  id: string;
  title?: string | null;
  body?: { content?: string | null; contentType?: string | null } | null;
  importance?: string | null;
  status?: string | null;
  dueDateTime?: { dateTime?: string | null; timeZone?: string | null } | null;
  completedDateTime?: {
    dateTime?: string | null;
    timeZone?: string | null;
  } | null;
  createdDateTime?: string | null;
  lastModifiedDateTime?: string | null;
  webLink?: string | null;
};

export type ProjectLinkLookup = {
  microsoftTaskId: string;
  microsoftListId: string;
  projectId: string;
  projectName: string;
};

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function parseGraphDate(
  dt: { dateTime?: string | null; timeZone?: string | null } | null | undefined
): string | null {
  if (!dt?.dateTime) return null;
  // Graph often returns local datetime without Z; treat as UTC-ish for sorting.
  const raw = dt.dateTime.endsWith("Z") ? dt.dateTime : `${dt.dateTime}Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(dt.dateTime);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  return d.toISOString();
}

function mapImportance(
  value: string | null | undefined
): NormalizedMicrosoftTodoTask["importance"] {
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "normal";
}

function mapStatus(
  value: string | null | undefined
): NormalizedMicrosoftTodoTask["status"] {
  switch (value) {
    case "completed":
      return "completed";
    case "inProgress":
      return "inProgress";
    case "waitingOnOthers":
      return "waitingOnOthers";
    case "deferred":
      return "deferred";
    default:
      return "notStarted";
  }
}

function isOverdue(
  dueIso: string | null,
  status: NormalizedMicrosoftTodoTask["status"]
): boolean {
  if (!dueIso || status === "completed") return false;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  return due.getTime() < now.getTime();
}

export function normalizeGraphTask(
  task: GraphTodoTask,
  listId: string,
  accountId: string | null,
  link?: ProjectLinkLookup | null
): NormalizedMicrosoftTodoTask {
  const status = mapStatus(task.status);
  const dueDate = parseGraphDate(task.dueDateTime);
  const microsoftTaskId = task.id;

  return {
    id: `ms-todo-${microsoftTaskId}`,
    externalId: microsoftTaskId,
    title: (task.title || "Untitled task").trim() || "Untitled task",
    description: stripHtml(task.body?.content),
    importance: mapImportance(task.importance),
    status,
    dueDate,
    completedAt: parseGraphDate(task.completedDateTime),
    source: "MICROSOFT_TODO",
    microsoftTaskId,
    microsoftListId: listId,
    microsoftAccountId: accountId,
    linkedProjectId: link?.projectId ?? null,
    linkedProjectName: link?.projectName ?? null,
    webLink: task.webLink ?? null,
    isOverdue: isOverdue(dueDate, status),
  };
}

/** Deduplicate by microsoftTaskId (stable external id). */
export function dedupeByMicrosoftTaskId(
  tasks: NormalizedMicrosoftTodoTask[]
): NormalizedMicrosoftTodoTask[] {
  const seen = new Map<string, NormalizedMicrosoftTodoTask>();
  for (const t of tasks) {
    if (!seen.has(t.microsoftTaskId)) {
      seen.set(t.microsoftTaskId, t);
    }
  }
  return Array.from(seen.values());
}

/**
 * Sort high-priority tasks:
 * 1. Overdue
 * 2. Due today
 * 3. Due soon (within 7 days)
 * 4. Remaining
 */
export function sortHighPriorityTasks(
  tasks: NormalizedMicrosoftTodoTask[]
): NormalizedMicrosoftTodoTask[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const endToday = new Date(start);
  endToday.setDate(endToday.getDate() + 1);
  const endSoon = new Date(start);
  endSoon.setDate(endSoon.getDate() + 7);

  function bucket(t: NormalizedMicrosoftTodoTask): number {
    if (!t.dueDate) return 3;
    const d = new Date(t.dueDate);
    if (Number.isNaN(d.getTime())) return 3;
    if (d < start || t.isOverdue) return 0;
    if (d < endToday) return 1;
    if (d < endSoon) return 2;
    return 3;
  }

  return [...tasks].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title);
  });
}
