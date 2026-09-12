export type GoogleSyncStatus =
  | "LOCAL_ONLY"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_ERROR"
  | "RECONNECT_REQUIRED";

export type GoogleConnectionStatus =
  | "CONNECTED"
  | "RECONNECT_REQUIRED"
  | "ERROR"
  | "DISCONNECTED";

export type PublicGoogleConnection = {
  connected: boolean;
  status: GoogleConnectionStatus | "NOT_CONNECTED";
  email: string | null;
  configured: boolean;
};
