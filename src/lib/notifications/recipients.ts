import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ResolvedRecipient = {
  userId: string;
  projectId: string | null;
};

function unique(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function resolveSelectionClients(input: {
  companyId: string;
  projectId: string;
}): Promise<ResolvedRecipient[]> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    select: {
      id: true,
      buyer: { select: { userId: true } },
      access: { where: { role: Role.CLIENT }, select: { userId: true } },
    },
  });
  if (!project) return [];
  const userIds = unique([
    project.buyer?.userId,
    ...project.access.map((a) => a.userId),
  ]);
  return userIds.map((userId) => ({ userId, projectId: project.id }));
}

export async function resolveResponsiblePm(input: {
  companyId: string;
  projectId: string;
}): Promise<ResolvedRecipient[]> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
    select: { id: true, pmId: true },
  });
  if (!project?.pmId) return [];
  const membership = await prisma.membership.findFirst({
    where: {
      companyId: input.companyId,
      userId: project.pmId,
      isActive: true,
      role: Role.PROJECT_MANAGER,
    },
    select: { userId: true },
  });
  if (!membership) return [];
  return [{ userId: membership.userId, projectId: project.id }];
}

export async function resolveTaskAssignee(input: {
  companyId: string;
  taskId: string;
}): Promise<ResolvedRecipient[]> {
  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      project: { companyId: input.companyId, deletedAt: null },
    },
    select: { assigneeId: true, projectId: true },
  });
  if (!task?.assigneeId) return [];
  return [{ userId: task.assigneeId, projectId: task.projectId }];
}

export async function resolveInvoiceClients(input: {
  companyId: string;
  invoiceId: string;
}): Promise<ResolvedRecipient[]> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: input.invoiceId,
      project: { companyId: input.companyId, deletedAt: null },
    },
    select: {
      projectId: true,
      project: {
        select: {
          buyer: { select: { userId: true } },
          access: { where: { role: Role.CLIENT }, select: { userId: true } },
        },
      },
    },
  });
  if (!invoice) return [];
  const userIds = unique([
    invoice.project.buyer?.userId,
    ...invoice.project.access.map((a) => a.userId),
  ]);
  return userIds.map((userId) => ({ userId, projectId: invoice.projectId }));
}

export async function resolveDepositOffice(input: {
  companyId: string;
  projectId?: string | null;
}): Promise<ResolvedRecipient[]> {
  const members = await prisma.membership.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      OR: [
        { role: Role.BOOKKEEPER },
        { role: Role.OPERATIONS_ADMIN, financeAccess: true },
      ],
    },
    select: { userId: true, role: true },
  });
  return members.map((m) => ({
    userId: m.userId,
    projectId: input.projectId ?? null,
  }));
}

export function recipientsAreIsolated(input: {
  allowedUserIds: string[];
  candidateUserId: string;
}): boolean {
  return input.allowedUserIds.includes(input.candidateUserId);
}
