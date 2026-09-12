import "server-only";

import { prisma } from "@/lib/db";
import {
  getMicrosoftOAuthConfig,
  isMicrosoftTodoConfigured,
  microsoftAuthorizeUrl,
  microsoftTokenUrl,
  MICROSOFT_TODO_SCOPES,
  GRAPH_BASE,
  type PublicMicrosoftTodoConnection,
  type MicrosoftConnectionStatus,
} from "@/lib/microsoft/config";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";
import {
  getMicrosoftCache,
  invalidateMicrosoftCacheForUser,
  microsoftTasksCacheKey,
  setMicrosoftCache,
} from "@/lib/microsoft/cache";
import {
  dedupeByMicrosoftTaskId,
  normalizeGraphTask,
  sortHighPriorityTasks,
  type GraphTodoTask,
  type ProjectLinkLookup,
} from "@/lib/microsoft/normalize";
import type {
  MicrosoftTodoFetchResult,
  NormalizedMicrosoftTodoTask,
} from "@/lib/microsoft/types";
import { AppError } from "@/lib/errors";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GraphList = { id: string; displayName?: string };

export function buildMicrosoftAuthUrl(state: string): string {
  const { clientId, tenant, redirectUri } = getMicrosoftOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_TODO_SCOPES.join(" "),
    state,
    prompt: "consent",
  });
  return `${microsoftAuthorizeUrl(tenant)}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, tenant, redirectUri } =
    getMicrosoftOAuthConfig();
  // Do not re-send `scope` on the token request — scopes are fixed at authorize time.
  // Re-sending scope can break personal Microsoft account (consumers) exchanges.
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(microsoftTokenUrl(tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => null)) as
    | (TokenResponse & {
        error?: string;
        error_description?: string;
      })
    | null;

  if (!res.ok || !raw?.access_token) {
    const desc = raw?.error_description || raw?.error || "";
    // Never include the auth code or secrets in the user-facing message.
    let message = "Could not exchange Microsoft authorization code.";
    if (/AADSTS700016/i.test(desc)) {
      message =
        "Microsoft app ID was not found for this tenant. Check MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID=consumers.";
    } else if (/AADSTS7000215|invalid_client/i.test(desc)) {
      message =
        "Microsoft client secret is invalid. Create a new client secret in Azure and update MICROSOFT_CLIENT_SECRET.";
    } else if (/AADSTS54005|invalid_grant|code/i.test(desc)) {
      message =
        "Microsoft authorization code expired or was already used. Click Connect again.";
    } else if (/redirect_uri/i.test(desc)) {
      message =
        "Redirect URI mismatch. Azure redirect URI must exactly match MICROSOFT_REDIRECT_URI.";
    } else if (desc) {
      message = desc.replace(/\r?\n/g, " ").slice(0, 180);
    }
    throw new AppError(message, 400, "MICROSOFT_TOKEN");
  }

  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_in: raw.expires_in,
    scope: raw.scope,
    token_type: raw.token_type,
  };
}

export async function getMicrosoftAccountProfile(accessToken: string): Promise<{
  email: string | null;
  accountId: string | null;
}> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { email: null, accountId: null };
    const me = (await res.json()) as {
      id?: string;
      mail?: string;
      userPrincipalName?: string;
    };
    return {
      email: me.mail || me.userPrincipalName || null,
      accountId: me.id ?? null,
    };
  } catch {
    return { email: null, accountId: null };
  }
}

export async function getPublicMicrosoftConnection(
  userId: string,
  companyId: string
): Promise<PublicMicrosoftTodoConnection> {
  const configured = isMicrosoftTodoConfigured();
  const row = await prisma.microsoftTodoConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      status: true,
      microsoftAccountEmail: true,
    },
  });
  if (!row || row.status === "DISCONNECTED") {
    return {
      connected: false,
      status: "NOT_CONNECTED",
      email: null,
      configured,
    };
  }
  return {
    connected: row.status === "CONNECTED",
    status: row.status as MicrosoftConnectionStatus,
    email: row.microsoftAccountEmail,
    configured,
  };
}

export async function saveMicrosoftConnection(input: {
  userId: string;
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  scope?: string | null;
  email?: string | null;
  accountId?: string | null;
}) {
  const accessTokenEncrypted = await encryptSecret(input.accessToken);
  const existing = await prisma.microsoftTodoConnection.findUnique({
    where: {
      userId_companyId: {
        userId: input.userId,
        companyId: input.companyId,
      },
    },
    select: { id: true, refreshTokenEncrypted: true },
  });

  let refreshTokenEncrypted = existing?.refreshTokenEncrypted ?? null;
  if (input.refreshToken) {
    refreshTokenEncrypted = await encryptSecret(input.refreshToken);
  }

  if (!refreshTokenEncrypted) {
    throw new AppError(
      "Microsoft did not return a refresh token. Remove Sunbuild access in your Microsoft account permissions and try again.",
      400,
      "MICROSOFT_REFRESH"
    );
  }

  const expiry =
    input.expiresIn != null
      ? new Date(Date.now() + input.expiresIn * 1000)
      : null;

  const data = {
    microsoftAccountEmail: input.email ?? null,
    microsoftAccountId: input.accountId ?? null,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiry: expiry,
    scope: input.scope ?? MICROSOFT_TODO_SCOPES.join(" "),
    status: "CONNECTED",
    connectedAt: new Date(),
  };

  if (existing) {
    await prisma.microsoftTodoConnection.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.microsoftTodoConnection.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        ...data,
      },
    });
  }

  invalidateMicrosoftCacheForUser(input.userId);
}

export async function disconnectMicrosoftTodo(
  userId: string,
  companyId: string
) {
  const row = await prisma.microsoftTodoConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!row) return;

  await prisma.microsoftTodoConnection.update({
    where: { id: row.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: await encryptSecret("revoked"),
      refreshTokenEncrypted: null,
      tokenExpiry: null,
      microsoftAccountEmail: null,
      microsoftAccountId: null,
    },
  });

  invalidateMicrosoftCacheForUser(userId);
}

async function markReconnectRequired(connectionId: string) {
  await prisma.microsoftTodoConnection.update({
    where: { id: connectionId },
    data: { status: "RECONNECT_REQUIRED" },
  });
}

async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const { clientId, clientSecret, tenant } = getMicrosoftOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(microsoftTokenUrl(tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const raw = (await res.json().catch(() => null)) as
    | (TokenResponse & { error?: string; error_description?: string })
    | null;

  if (!res.ok || !raw?.access_token) {
    throw new AppError("Microsoft session expired", 401, "MICROSOFT_REFRESH");
  }
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_in: raw.expires_in,
    scope: raw.scope,
    token_type: raw.token_type,
  };
}

type AuthedClient = {
  accessToken: string;
  accountId: string | null;
  connectionId: string;
};

async function getAuthedClient(
  userId: string,
  companyId: string
): Promise<AuthedClient | { reconnectRequired: true; error: string } | null> {
  if (!isMicrosoftTodoConfigured()) return null;

  const row = await prisma.microsoftTodoConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (!row || row.status === "DISCONNECTED") return null;

  if (row.status === "RECONNECT_REQUIRED") {
    return {
      reconnectRequired: true,
      error: "Reconnect Microsoft To Do to continue syncing.",
    };
  }

  let accessToken = await decryptSecret(row.accessTokenEncrypted);
  const needsRefresh =
    !row.tokenExpiry || row.tokenExpiry.getTime() < Date.now() + 60_000;

  if (needsRefresh) {
    if (!row.refreshTokenEncrypted) {
      await markReconnectRequired(row.id);
      return {
        reconnectRequired: true,
        error: "Reconnect Microsoft To Do to continue syncing.",
      };
    }
    try {
      const refresh = await decryptSecret(row.refreshTokenEncrypted);
      const tokens = await refreshAccessToken(refresh);
      accessToken = tokens.access_token;
      const accessTokenEncrypted = await encryptSecret(tokens.access_token);
      let refreshTokenEncrypted = row.refreshTokenEncrypted;
      if (tokens.refresh_token) {
        refreshTokenEncrypted = await encryptSecret(tokens.refresh_token);
      }
      await prisma.microsoftTodoConnection.update({
        where: { id: row.id },
        data: {
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiry: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : row.tokenExpiry,
          status: "CONNECTED",
          scope: tokens.scope ?? row.scope,
        },
      });
    } catch {
      await markReconnectRequired(row.id);
      return {
        reconnectRequired: true,
        error: "Reconnect Microsoft To Do to continue syncing.",
      };
    }
  }

  return {
    accessToken,
    accountId: row.microsoftAccountId,
    connectionId: row.id,
  };
}

async function graphGet<T>(
  accessToken: string,
  path: string
): Promise<T> {
  const res = await fetch(
    path.startsWith("http") ? path : `${GRAPH_BASE}${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    }
  );

  if (res.status === 401) {
    throw new AppError("Microsoft session expired", 401, "MICROSOFT_AUTH");
  }
  if (!res.ok) {
    throw new AppError(
      "Unable to sync Microsoft To Do.",
      502,
      "MICROSOFT_GRAPH"
    );
  }
  return (await res.json()) as T;
}

async function graphPatch(
  accessToken: string,
  path: string,
  body: unknown
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new AppError("Microsoft session expired", 401, "MICROSOFT_AUTH");
  }
  if (!res.ok) {
    throw new AppError(
      "Unable to update Microsoft To Do task.",
      502,
      "MICROSOFT_GRAPH"
    );
  }
}

async function listAllTodoLists(accessToken: string): Promise<GraphList[]> {
  type ListPage = {
    value?: GraphList[];
    "@odata.nextLink"?: string;
  };
  const lists: GraphList[] = [];
  let next: string | null = `${GRAPH_BASE}/me/todo/lists?$top=50`;
  while (next) {
    const page: ListPage = await graphGet<ListPage>(accessToken, next);
    for (const list of page.value ?? []) {
      if (list.id) lists.push(list);
    }
    next = page["@odata.nextLink"] ?? null;
  }
  return lists;
}

async function listTasksInList(
  accessToken: string,
  listId: string
): Promise<GraphTodoTask[]> {
  type TaskPage = {
    value?: GraphTodoTask[];
    "@odata.nextLink"?: string;
  };
  const tasks: GraphTodoTask[] = [];
  // Prefer incomplete high-importance first; still fetch broadly then filter.
  let next: string | null =
    `${GRAPH_BASE}/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`;
  while (next) {
    const page: TaskPage = await graphGet<TaskPage>(accessToken, next);
    for (const t of page.value ?? []) {
      if (t.id) tasks.push(t);
    }
    next = page["@odata.nextLink"] ?? null;
    // Safety cap — avoid unbounded pagination on huge accounts
    if (tasks.length >= 500) break;
  }
  return tasks;
}

async function loadProjectLinks(
  userId: string,
  companyId: string
): Promise<Map<string, ProjectLinkLookup>> {
  const rows = await prisma.microsoftTodoProjectLink.findMany({
    where: { userId, companyId },
    include: { project: { select: { id: true, name: true } } },
  });
  const map = new Map<string, ProjectLinkLookup>();
  for (const row of rows) {
    map.set(row.microsoftTaskId, {
      microsoftTaskId: row.microsoftTaskId,
      microsoftListId: row.microsoftListId,
      projectId: row.project.id,
      projectName: row.project.name,
    });
  }
  return map;
}

async function fetchAllNormalizedTasks(
  userId: string,
  companyId: string,
  accessToken: string,
  accountId: string | null
): Promise<NormalizedMicrosoftTodoTask[]> {
  const [lists, links] = await Promise.all([
    listAllTodoLists(accessToken),
    loadProjectLinks(userId, companyId),
  ]);

  const settled = await Promise.allSettled(
    lists.map(async (list) => {
      const raw = await listTasksInList(accessToken, list.id);
      return raw.map((t) =>
        normalizeGraphTask(t, list.id, accountId, links.get(t.id) ?? null)
      );
    })
  );

  const all: NormalizedMicrosoftTodoTask[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  return dedupeByMicrosoftTaskId(all);
}

/**
 * Load high-importance incomplete Microsoft To Do tasks for the dashboard.
 * Failures return a safe empty result — never throw to the page renderer.
 */
export async function loadHighPriorityMicrosoftTasks(
  userId: string,
  companyId: string,
  options?: { bypassCache?: boolean }
): Promise<MicrosoftTodoFetchResult> {
  const connection = await getPublicMicrosoftConnection(userId, companyId);

  if (!connection.configured) {
    return {
      tasks: [],
      connection,
      error: null,
      reconnectRequired: false,
    };
  }

  if (!connection.connected && connection.status === "NOT_CONNECTED") {
    return {
      tasks: [],
      connection,
      error: null,
      reconnectRequired: false,
    };
  }

  if (connection.status === "RECONNECT_REQUIRED") {
    return {
      tasks: [],
      connection,
      error: "Reconnect Microsoft To Do to continue syncing.",
      reconnectRequired: true,
    };
  }

  const cacheKey = microsoftTasksCacheKey(userId, companyId, "high");
  if (!options?.bypassCache) {
    const cached = getMicrosoftCache<MicrosoftTodoFetchResult>(cacheKey);
    if (cached) return cached;
  }

  try {
    const authed = await getAuthedClient(userId, companyId);
    if (!authed) {
      return {
        tasks: [],
        connection: await getPublicMicrosoftConnection(userId, companyId),
        error: null,
        reconnectRequired: false,
      };
    }
    if ("reconnectRequired" in authed) {
      return {
        tasks: [],
        connection: await getPublicMicrosoftConnection(userId, companyId),
        error: authed.error,
        reconnectRequired: true,
      };
    }

    const all = await fetchAllNormalizedTasks(
      userId,
      companyId,
      authed.accessToken,
      authed.accountId
    );

    const high = sortHighPriorityTasks(
      all.filter(
        (t) => t.importance === "high" && t.status !== "completed"
      )
    );

    const result: MicrosoftTodoFetchResult = {
      tasks: high,
      connection: await getPublicMicrosoftConnection(userId, companyId),
      error: null,
      reconnectRequired: false,
    };
    setMicrosoftCache(cacheKey, result);
    // Also cache full incomplete set for View All filters
    setMicrosoftCache(
      microsoftTasksCacheKey(userId, companyId, "incomplete"),
      {
        ...result,
        tasks: dedupeByMicrosoftTaskId(
          all.filter((t) => t.status !== "completed")
        ),
      }
    );
    return result;
  } catch {
    return {
      tasks: [],
      connection: await getPublicMicrosoftConnection(userId, companyId),
      error: "Unable to sync Microsoft To Do.",
      reconnectRequired: false,
    };
  }
}

/** All incomplete Microsoft tasks (for View All / filters). */
export async function loadMicrosoftTodoTasks(
  userId: string,
  companyId: string,
  options?: {
    importance?: "high" | "all";
    bypassCache?: boolean;
  }
): Promise<MicrosoftTodoFetchResult> {
  const importance = options?.importance ?? "all";
  if (importance === "high") {
    return loadHighPriorityMicrosoftTasks(userId, companyId, options);
  }

  const connection = await getPublicMicrosoftConnection(userId, companyId);
  if (!connection.connected) {
    return {
      tasks: [],
      connection,
      error:
        connection.status === "RECONNECT_REQUIRED"
          ? "Reconnect Microsoft To Do to continue syncing."
          : null,
      reconnectRequired: connection.status === "RECONNECT_REQUIRED",
    };
  }

  const cacheKey = microsoftTasksCacheKey(userId, companyId, "incomplete");
  if (!options?.bypassCache) {
    const cached = getMicrosoftCache<MicrosoftTodoFetchResult>(cacheKey);
    if (cached) return cached;
  }

  try {
    const authed = await getAuthedClient(userId, companyId);
    if (!authed || "reconnectRequired" in authed) {
      return {
        tasks: [],
        connection: await getPublicMicrosoftConnection(userId, companyId),
        error:
          authed && "reconnectRequired" in authed
            ? authed.error
            : null,
        reconnectRequired: Boolean(
          authed && "reconnectRequired" in authed
        ),
      };
    }

    const all = await fetchAllNormalizedTasks(
      userId,
      companyId,
      authed.accessToken,
      authed.accountId
    );
    const incomplete = dedupeByMicrosoftTaskId(
      all.filter((t) => t.status !== "completed")
    );
    const result: MicrosoftTodoFetchResult = {
      tasks: sortHighPriorityTasks(incomplete),
      connection: await getPublicMicrosoftConnection(userId, companyId),
      error: null,
      reconnectRequired: false,
    };
    setMicrosoftCache(cacheKey, result);
    return result;
  } catch {
    return {
      tasks: [],
      connection: await getPublicMicrosoftConnection(userId, companyId),
      error: "Unable to sync Microsoft To Do.",
      reconnectRequired: false,
    };
  }
}

export async function completeMicrosoftTodoTask(input: {
  userId: string;
  companyId: string;
  microsoftTaskId: string;
  microsoftListId: string;
}): Promise<{ ok: true } | { ok: false; error: string; reconnectRequired?: boolean }> {
  try {
    const authed = await getAuthedClient(input.userId, input.companyId);
    if (!authed) {
      return { ok: false, error: "Microsoft To Do is not connected." };
    }
    if ("reconnectRequired" in authed) {
      return {
        ok: false,
        error: authed.error,
        reconnectRequired: true,
      };
    }

    await graphPatch(
      authed.accessToken,
      `/me/todo/lists/${encodeURIComponent(input.microsoftListId)}/tasks/${encodeURIComponent(input.microsoftTaskId)}`,
      {
        status: "completed",
        completedDateTime: {
          dateTime: new Date().toISOString().replace(/\.\d{3}Z$/, ""),
          timeZone: "UTC",
        },
      }
    );

    invalidateMicrosoftCacheForUser(input.userId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError && err.code === "MICROSOFT_AUTH") {
      return {
        ok: false,
        error: "Reconnect Microsoft To Do to continue syncing.",
        reconnectRequired: true,
      };
    }
    return { ok: false, error: "Unable to update Microsoft To Do task." };
  }
}

export async function upsertMicrosoftTaskProjectLink(input: {
  userId: string;
  companyId: string;
  microsoftTaskId: string;
  microsoftListId: string;
  projectId: string;
}) {
  await prisma.microsoftTodoProjectLink.upsert({
    where: {
      userId_companyId_microsoftTaskId: {
        userId: input.userId,
        companyId: input.companyId,
        microsoftTaskId: input.microsoftTaskId,
      },
    },
    create: {
      userId: input.userId,
      companyId: input.companyId,
      microsoftTaskId: input.microsoftTaskId,
      microsoftListId: input.microsoftListId,
      projectId: input.projectId,
    },
    update: {
      microsoftListId: input.microsoftListId,
      projectId: input.projectId,
    },
  });
  invalidateMicrosoftCacheForUser(input.userId);
}

export async function removeMicrosoftTaskProjectLink(input: {
  userId: string;
  companyId: string;
  microsoftTaskId: string;
}) {
  await prisma.microsoftTodoProjectLink.deleteMany({
    where: {
      userId: input.userId,
      companyId: input.companyId,
      microsoftTaskId: input.microsoftTaskId,
    },
  });
  invalidateMicrosoftCacheForUser(input.userId);
}
