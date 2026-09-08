import { prisma } from "@/lib/db";

const REDACT_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "accessToken",
  "refreshToken",
  "tempPassword",
]);

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function writeAudit(input: {
  userId?: string | null;
  companyId?: string | null;
  projectId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const safe = sanitizeMetadata(input.metadata);
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      companyId: input.companyId ?? undefined,
      projectId: input.projectId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      metadata: safe ? JSON.stringify(safe) : undefined,
    },
  });
}
