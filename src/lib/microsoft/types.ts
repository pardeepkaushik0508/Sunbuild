export type MicrosoftConnectionStatus =
  | "CONNECTED"
  | "RECONNECT_REQUIRED"
  | "ERROR"
  | "DISCONNECTED";

export type PublicMicrosoftTodoConnection = {
  connected: boolean;
  status: MicrosoftConnectionStatus | "NOT_CONNECTED";
  email: string | null;
  configured: boolean;
};

/** Normalized task DTO — never expose Graph tokens or raw Graph payloads to the UI. */
export type NormalizedMicrosoftTodoTask = {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  importance: "high" | "normal" | "low";
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  dueDate: string | null;
  completedAt: string | null;
  source: "MICROSOFT_TODO";
  microsoftTaskId: string;
  microsoftListId: string;
  microsoftAccountId: string | null;
  linkedProjectId: string | null;
  linkedProjectName: string | null;
  webLink: string | null;
  isOverdue: boolean;
};

export type MicrosoftTodoFetchResult = {
  tasks: NormalizedMicrosoftTodoTask[];
  connection: PublicMicrosoftTodoConnection;
  error: string | null;
  reconnectRequired: boolean;
};
