import "server-only";

import { AppError } from "@/lib/errors";

export const MICROSOFT_TODO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  // Full Graph resource scopes are more reliable for personal (consumers) accounts.
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Tasks.ReadWrite",
] as const;

export type {
  MicrosoftConnectionStatus,
  PublicMicrosoftTodoConnection,
  NormalizedMicrosoftTodoTask,
  MicrosoftTodoFetchResult,
} from "@/lib/microsoft/types";

export function getMicrosoftOAuthConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenant =
    process.env.MICROSOFT_TENANT_ID?.trim() || "consumers";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() ||
    `${(process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "")}/api/microsoft/todo/callback`;

  if (!clientId || !clientSecret) {
    throw new AppError(
      "Microsoft To Do is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.",
      503,
      "MICROSOFT_CONFIG"
    );
  }

  return { clientId, clientSecret, tenant, redirectUri };
}

export function isMicrosoftTodoConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID?.trim() &&
      process.env.MICROSOFT_CLIENT_SECRET?.trim()
  );
}

export function microsoftAuthorizeUrl(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
}

export function microsoftTokenUrl(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
