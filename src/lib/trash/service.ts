import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { TRASH_RETENTION_DAYS, trashPurgeDeadline } from "@/lib/trash/constants";

async function assertCanManageTrash(
  actorUserId: string,
  companyId: string,
  role: Role
) {
  if (
    role !== Role.OWNER &&
    role !== Role.OPERATIONS_ADMIN &&
    role !== Role.CEO
  ) {
    throw new ForbiddenError("Only owners and admins can manage trash");
  }
  const membership = await prisma.membership.findFirst({
    where: {
      userId: actorUserId,
      companyId,
      isActive: true,
      role: { in: [Role.OWNER, Role.OPERATIONS_ADMIN, Role.CEO] },
    },
  });
  if (!membership) throw new ForbiddenError();
}

/**
 * Soft-delete a user: Trash + deactivate + revoke sessions (cannot log in).
 */
export async function softDeleteUser(opts: {
  userId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { userId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  if (userId === actorUserId) {
    throw new AppError("You cannot delete your own account");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, companyId },
    include: { user: true },
  });
  if (!membership) throw new AppError("User not found in this company");
  if (membership.user.deletedAt) {
    throw new AppError("User is already in Trash");
  }

  if (membership.role === Role.OWNER) {
    const activeOwners = await prisma.membership.count({
      where: {
        companyId,
        role: Role.OWNER,
        isActive: true,
        user: { isActive: true, deletedAt: null },
        userId: { not: userId },
      },
    });
    if (activeOwners === 0) {
      throw new AppError("Cannot delete the last active owner");
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: now,
        deletedById: actorUserId,
      },
    });
    await tx.membership.updateMany({
      where: { userId, companyId },
      data: { isActive: false },
    });
    await tx.session.deleteMany({ where: { userId } });
  });

  await writeAudit({
    userId: actorUserId,
    companyId,
    action: "USER_SOFT_DELETED",
    entityType: "User",
    entityId: userId,
    metadata: {
      email: membership.user.email,
      purgeAfter: trashPurgeDeadline(now).toISOString(),
      retentionDays: TRASH_RETENTION_DAYS,
    },
  });
}

/**
 * Soft-delete a project: hidden from every user until restored or purged.
 */
export async function softDeleteProject(opts: {
  projectId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { projectId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: null },
  });
  if (!project) throw new AppError("Project not found");

  const now = new Date();
  await prisma.project.update({
    where: { id: projectId },
    data: {
      deletedAt: now,
      deletedById: actorUserId,
    },
  });

  await writeAudit({
    userId: actorUserId,
    companyId,
    projectId,
    action: "PROJECT_SOFT_DELETED",
    entityType: "Project",
    entityId: projectId,
    metadata: {
      name: project.name,
      purgeAfter: trashPurgeDeadline(now).toISOString(),
      retentionDays: TRASH_RETENTION_DAYS,
    },
  });
}

export async function restoreUserFromTrash(opts: {
  userId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { userId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: { not: null } },
  });
  if (!user) throw new AppError("User not found in Trash");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deletedAt: null,
        deletedById: null,
      },
    });
    await tx.membership.updateMany({
      where: { userId, companyId },
      data: { isActive: true },
    });
  });

  await writeAudit({
    userId: actorUserId,
    companyId,
    action: "USER_RESTORED",
    entityType: "User",
    entityId: userId,
  });
}

export async function restoreProjectFromTrash(opts: {
  projectId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { projectId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: { not: null } },
  });
  if (!project) throw new AppError("Project not found in Trash");

  await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt: null, deletedById: null },
  });

  await writeAudit({
    userId: actorUserId,
    companyId,
    projectId,
    action: "PROJECT_RESTORED",
    entityType: "Project",
    entityId: projectId,
  });
}

async function hardDeleteUserRows(userId: string, reassignToUserId?: string | null) {
  const fallback = reassignToUserId;
  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({
      where: { pmId: userId },
      data: { pmId: null },
    });
    await tx.projectAccess.deleteMany({ where: { userId } });
    await tx.membership.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.twoFactor.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.lead.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    });
    await tx.task.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    });
    await tx.rFI.updateMany({
      where: { assigneeId: userId },
      data: { assigneeId: null },
    });
    await tx.warrantyTicket.updateMany({
      where: { pmId: userId },
      data: { pmId: null },
    });
    await tx.invoice.updateMany({
      where: { payeeUserId: userId },
      data: { payeeUserId: null },
    });
    await tx.smsMessage.updateMany({
      where: { senderUserId: userId },
      data: { senderUserId: null },
    });
    await tx.auditLog.updateMany({
      where: { userId },
      data: { userId: null },
    });

    if (fallback) {
      await tx.lead.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.proposal.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.purchaseContract.updateMany({
        where: { uploadedById: userId },
        data: { uploadedById: fallback },
      });
      await tx.purchaseContract.updateMany({
        where: { salesPersonId: userId },
        data: { salesPersonId: null },
      });
      await tx.purchaseContractVersion.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.task.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.changeOrder.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.rFI.updateMany({
        where: { createdById: userId },
        data: { createdById: fallback },
      });
      await tx.dailyLog.updateMany({
        where: { authorId: userId },
        data: { authorId: fallback },
      });
      await tx.document.updateMany({
        where: { uploadedById: userId },
        data: { uploadedById: fallback },
      });
      await tx.photo.updateMany({
        where: { uploadedById: userId },
        data: { uploadedById: fallback },
      });
      await tx.invoice.updateMany({
        where: { uploadedById: userId },
        data: { uploadedById: fallback },
      });
      await tx.warrantyTicket.updateMany({
        where: { clientUserId: userId },
        data: { clientUserId: fallback },
      });
      await tx.warrantyComment.updateMany({
        where: { userId },
        data: { userId: fallback },
      });
      await tx.selectionApproval.updateMany({
        where: { userId },
        data: { userId: fallback },
      });
      await tx.invitation.updateMany({
        where: { invitedById: userId },
        data: { invitedById: fallback },
      });
      await tx.leadActivity.updateMany({
        where: { userId },
        data: { userId: fallback },
      });
    }

    await tx.user.delete({ where: { id: userId } });
  });
}

/** Null optional FKs that do not cascade, then delete project (DB cascades children). */
async function hardDeleteProjectRows(projectId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.deposit.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
    await tx.condition.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
    await tx.purchaseContract.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
    await tx.scheduleOfAllowances.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
    await tx.smsMessage.updateMany({
      where: { projectId },
      data: { projectId: null },
    });
    await tx.project.delete({ where: { id: projectId } });
  });
}

export async function permanentlyDeleteUser(opts: {
  userId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { userId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  if (userId === actorUserId) {
    throw new AppError("You cannot permanently delete your own account");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, companyId },
    include: { user: true },
  });
  if (!membership?.user.deletedAt) {
    throw new AppError("User must be in Trash before permanent delete");
  }

  const email = membership.user.email;
  const fallbackOwner = await prisma.membership.findFirst({
    where: {
      companyId,
      role: { in: [Role.OWNER, Role.OPERATIONS_ADMIN] },
      userId: { not: userId },
      user: { deletedAt: null, isActive: true },
    },
    select: { userId: true },
  });
  await hardDeleteUserRows(userId, fallbackOwner?.userId ?? actorUserId);

  await writeAudit({
    userId: actorUserId,
    companyId,
    action: "USER_PERMANENTLY_DELETED",
    entityType: "User",
    entityId: userId,
    metadata: { email },
  });
}

export async function permanentlyDeleteProject(opts: {
  projectId: string;
  companyId: string;
  actorUserId: string;
  actorRole: Role;
}) {
  const { projectId, companyId, actorUserId, actorRole } = opts;
  await assertCanManageTrash(actorUserId, companyId, actorRole);

  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId, deletedAt: { not: null } },
  });
  if (!project) {
    throw new AppError("Project must be in Trash before permanent delete");
  }

  const name = project.name;
  await hardDeleteProjectRows(projectId);

  await writeAudit({
    userId: actorUserId,
    companyId,
    action: "PROJECT_PERMANENTLY_DELETED",
    entityType: "Project",
    entityId: projectId,
    metadata: { name },
  });
}

/**
 * Permanently delete Trash items older than the retention window (cron-safe).
 */
export async function purgeExpiredTrash(opts?: { companyId?: string }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

  const expiredProjects = await prisma.project.findMany({
    where: {
      ...(opts?.companyId ? { companyId: opts.companyId } : {}),
      deletedAt: { not: null, lte: cutoff },
    },
    select: { id: true, companyId: true, name: true },
  });

  const expiredUsers = await prisma.user.findMany({
    where: {
      deletedAt: { not: null, lte: cutoff },
      ...(opts?.companyId
        ? { memberships: { some: { companyId: opts.companyId } } }
        : {}),
    },
    select: {
      id: true,
      email: true,
      memberships: { select: { companyId: true }, take: 1 },
    },
  });

  let projectsPurged = 0;
  let usersPurged = 0;

  for (const p of expiredProjects) {
    try {
      await hardDeleteProjectRows(p.id);
      projectsPurged += 1;
      await writeAudit({
        userId: null,
        companyId: p.companyId,
        action: "PROJECT_PURGED",
        entityType: "Project",
        entityId: p.id,
        metadata: { name: p.name },
      });
    } catch (err) {
      console.error("[purge] project failed", p.id, err);
    }
  }

  for (const u of expiredUsers) {
    try {
      const companyId = u.memberships[0]?.companyId;
      let fallback: string | null = null;
      if (companyId) {
        const owner = await prisma.membership.findFirst({
          where: {
            companyId,
            role: { in: [Role.OWNER, Role.OPERATIONS_ADMIN] },
            userId: { not: u.id },
            user: { deletedAt: null, isActive: true },
          },
          select: { userId: true },
        });
        fallback = owner?.userId ?? null;
      }
      await hardDeleteUserRows(u.id, fallback);
      usersPurged += 1;
      if (companyId) {
        await writeAudit({
          userId: null,
          companyId,
          action: "USER_PURGED",
          entityType: "User",
          entityId: u.id,
          metadata: { email: u.email },
        });
      }
    } catch (err) {
      console.error("[purge] user failed", u.id, err);
    }
  }

  return { projectsPurged, usersPurged, cutoff };
}
