import "server-only";

import { prisma } from "@/lib/db";
import type { SmsTemplateContext } from "@/lib/sms/templates";

function moneyLabel(amount: number | null | undefined, currency = "CAD"): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function projectAddressLine(project: {
  municipalAddress?: string | null;
  lotInfo?: string | null;
}): string {
  return [project.municipalAddress, project.lotInfo].filter(Boolean).join(" · ");
}

/**
 * Build SMS template context from authoritative PostgreSQL data.
 * Never trusts browser-supplied names/amounts for automated sends.
 */
export async function resolveSmsTemplateContext(input: {
  recipientUserId: string;
  companyId: string;
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  href?: string | null;
  fallbackProjectName?: string | null;
  fallbackEntityTitle?: string | null;
}): Promise<SmsTemplateContext> {
  const user = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    select: { name: true },
  });

  const ctx: SmsTemplateContext = {
    recipientName: user?.name ?? null,
    href: input.href ?? null,
    projectUrl: input.href ?? null,
    projectName: input.fallbackProjectName ?? null,
    selectionName: input.fallbackEntityTitle ?? null,
    taskName: input.fallbackEntityTitle ?? null,
    invoiceNumber: null,
  };

  let projectId = input.projectId ?? null;

  if (input.entityType === "SelectionSection" && input.entityId) {
    const section = await prisma.selectionSection.findFirst({
      where: {
        id: input.entityId,
        package: { project: { companyId: input.companyId, deletedAt: null } },
      },
      select: {
        name: true,
        dueDate: true,
        package: {
          select: {
            project: {
              select: {
                id: true,
                name: true,
                municipalAddress: true,
                lotInfo: true,
              },
            },
          },
        },
      },
    });
    if (section) {
      projectId = section.package.project.id;
      ctx.selectionName = section.name;
      ctx.selectionDueDate = formatDate(section.dueDate);
      ctx.projectName = section.package.project.name;
      ctx.projectAddress = projectAddressLine(section.package.project);
    }
  }

  if (input.entityType === "Invoice" && input.entityId) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: input.entityId,
        project: { companyId: input.companyId, deletedAt: null },
      },
      select: {
        invoiceNumber: true,
        dueDate: true,
        project: {
          select: {
            id: true,
            name: true,
            municipalAddress: true,
            lotInfo: true,
          },
        },
      },
    });
    if (invoice) {
      projectId = invoice.project.id;
      ctx.invoiceNumber = invoice.invoiceNumber;
      ctx.invoiceDueDate = formatDate(invoice.dueDate);
      ctx.projectName = invoice.project.name;
      ctx.projectAddress = projectAddressLine(invoice.project);
    }
  }

  if (input.entityType === "Deposit" && input.entityId) {
    const deposit = await prisma.deposit.findFirst({
      where: {
        id: input.entityId,
        project: { companyId: input.companyId, deletedAt: null },
      },
      select: {
        amount: true,
        dueDate: true,
        label: true,
        project: {
          select: {
            id: true,
            name: true,
            municipalAddress: true,
            lotInfo: true,
          },
        },
      },
    });
    if (deposit?.project) {
      projectId = deposit.project.id;
      ctx.depositAmount = moneyLabel(deposit.amount);
      ctx.depositDueDate = formatDate(deposit.dueDate);
      ctx.projectName = deposit.project.name;
      ctx.projectAddress = projectAddressLine(deposit.project);
    }
  }

  if (input.entityType === "Task" && input.entityId) {
    const task = await prisma.task.findFirst({
      where: {
        id: input.entityId,
        project: { companyId: input.companyId, deletedAt: null },
      },
      select: {
        title: true,
        dueDate: true,
        project: {
          select: {
            id: true,
            name: true,
            municipalAddress: true,
            lotInfo: true,
          },
        },
      },
    });
    if (task) {
      projectId = task.project.id;
      ctx.taskName = task.title;
      ctx.taskDueDate = formatDate(task.dueDate);
      ctx.projectName = task.project.name;
      ctx.projectAddress = projectAddressLine(task.project);
    }
  }

  if (input.entityType === "Project" && input.entityId) {
    projectId = input.entityId;
  }

  if (projectId && (!ctx.projectName || !ctx.projectAddress)) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId: input.companyId, deletedAt: null },
      select: { name: true, municipalAddress: true, lotInfo: true },
    });
    if (project) {
      ctx.projectName = ctx.projectName || project.name;
      ctx.projectAddress = ctx.projectAddress || projectAddressLine(project);
    }
  }

  return ctx;
}
