"use server";

import {
  ChangeOrderStatus,
  Role,
  SelectionPackageStatus,
  SelectionSectionStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";
import { requireClientProjectAccess } from "@/lib/client/project";
import { computeAllowanceUsage } from "@/lib/client/allowance";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function rateLimit(userId: string, kind: string) {
  const h = await headers();
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    ACTION_RATE.limit,
    ACTION_RATE.windowMs
  );
}

function revalidateClientPortal(projectId?: string) {
  revalidatePath("/client");
  revalidatePath("/client/selections");
  revalidatePath("/client/schedule");
  revalidatePath("/client/calendar");
  revalidatePath("/client/payments");
  revalidatePath("/client/invoices");
  revalidatePath("/client/change-orders");
  revalidatePath("/pm/selections");
  revalidatePath("/pm/change-orders");
  if (projectId) {
    revalidatePath(`/pm/projects/${projectId}`);
  }
}

/**
 * Client confirms / approves a selection category.
 * Creates an approval audit row, marks section SUBMITTED for PM review,
 * and opens Change Orders for calculated overage (pending client CO approval).
 */
export async function clientApproveSelectionSectionAction(sectionId: string) {
  const session = await requireSession();
  requireCapability(session, "clientSelections");
  await rateLimit(session.user.id, "selection-client-approve");

  if (session.membership.role !== Role.CLIENT) {
    throw new AppError("Only clients can approve selections here");
  }

  const section = await prisma.selectionSection.findUnique({
    where: { id: sectionId },
    include: {
      package: true,
      items: true,
    },
  });
  if (!section) throw new AppError("Selection not found");
  await requireClientProjectAccess(session, section.package.projectId);

  if (
    section.status === SelectionSectionStatus.LOCKED ||
    section.status === SelectionSectionStatus.APPROVED
  ) {
    throw new AppError("This selection is already approved and locked");
  }
  if (
    section.status !== SelectionSectionStatus.DRAFT &&
    section.status !== SelectionSectionStatus.CHANGES_REQUESTED &&
    section.status !== SelectionSectionStatus.SUBMITTED
  ) {
    throw new AppError("This selection cannot be approved in its current state");
  }

  const usage = computeAllowanceUsage({
    sectionAllowance: section.allowance,
    items: section.items,
  });

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.selectionSection.updateMany({
      where: {
        id: sectionId,
        status: {
          in: [
            SelectionSectionStatus.DRAFT,
            SelectionSectionStatus.CHANGES_REQUESTED,
            SelectionSectionStatus.SUBMITTED,
          ],
        },
      },
      data: { status: SelectionSectionStatus.SUBMITTED },
    });
    if (claimed.count !== 1) {
      throw new AppError("This selection was already processed");
    }
    await tx.selectionPackage.update({
      where: { id: section.packageId },
      data: {
        status: SelectionPackageStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    const priorApproval = await tx.selectionApproval.findFirst({
      where: {
        sectionId,
        userId: session.user.id,
        action: "CLIENT_APPROVED",
      },
    });
    if (!priorApproval) {
      await tx.selectionApproval.create({
        data: {
          sectionId,
          userId: session.user.id,
          action: "CLIENT_APPROVED",
          comment: null,
        },
      });
    }

    if (usage.overage > 0) {
      const existing = await tx.changeOrder.findFirst({
        where: {
          projectId: section.package.projectId,
          reason: "Selection overage",
          title: `Overage: ${section.name}`,
          status: {
            in: [
              ChangeOrderStatus.DRAFT,
              ChangeOrderStatus.PENDING_CLIENT,
              ChangeOrderStatus.APPROVED,
            ],
          },
        },
      });
      if (!existing) {
        await tx.changeOrder.create({
          data: {
            projectId: section.package.projectId,
            title: `Overage: ${section.name}`,
            description: `Selection allowance exceeded for ${section.name}`,
            amount: usage.overage,
            reason: "Selection overage",
            status: ChangeOrderStatus.PENDING_CLIENT,
            relatedSelectionItemId: section.items[0]?.id ?? null,
            createdById: session.user.id,
          },
        });
      }
    }
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: section.package.projectId,
    action: "SELECTION_CLIENT_APPROVED",
    entityType: "SelectionSection",
    entityId: sectionId,
  });

  revalidateClientPortal(section.package.projectId);
}

export async function clientChangeOrderDecisionAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
  form: FormData
) {
  const session = await requireSession();
  requireCapability(session, "clientChangeOrders");
  await rateLimit(session.user.id, "co-client");

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new AppError("Invalid decision");
  }
  if (session.membership.role !== Role.CLIENT) {
    throw new AppError("Only clients can approve or reject change orders here");
  }

  const co = await prisma.changeOrder.findUnique({ where: { id } });
  if (!co) throw new AppError("Not found");
  await requireClientProjectAccess(session, co.projectId);

  if (co.status !== ChangeOrderStatus.PENDING_CLIENT) {
    throw new AppError("Change order is not awaiting your decision");
  }

  const comment = formString(form, "comment") || null;

  const updated = await prisma.changeOrder.updateMany({
    where: { id, status: ChangeOrderStatus.PENDING_CLIENT },
    data: {
      status:
        decision === "APPROVED"
          ? ChangeOrderStatus.APPROVED
          : ChangeOrderStatus.REJECTED,
      clientActionAt: new Date(),
      clientComment: comment,
    },
  });
  if (updated.count !== 1) {
    throw new AppError("Change order is no longer awaiting your decision");
  }

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId: co.projectId,
    action: `CHANGE_ORDER_${decision}`,
    entityType: "ChangeOrder",
    entityId: id,
    metadata: {
      esign: decision === "APPROVED",
      acceptedAt: new Date().toISOString(),
      version: co.updatedAt.toISOString(),
      comment,
    },
  });

  revalidateClientPortal(co.projectId);
}
