/**
 * Resolve which project (if any) a stored upload path belongs to,
 * and whether the current user may download it.
 */

import {
  DocumentVisibility,
  PhotoVisibility,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AppSession } from "@/lib/session";
import {
  assertProjectAccess,
  getAccessibleProjectIds,
} from "@/lib/session";
import { sessionHasFinanceAccess } from "@/lib/authorization";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getClientVisibleSectionIds } from "@/lib/selections/query";

function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export async function assertFileDownloadAccess(
  session: AppSession,
  rawPath: string
) {
  const filePath = normalizePath(rawPath);
  if (!filePath || filePath.includes("..") || filePath.includes("\0")) {
    throw new ForbiddenError();
  }

  const role = session.membership.role;
  const isClient = role === Role.CLIENT;
  const isSub = role === Role.SUBCONTRACTOR;

  // Profile avatars — owner always; same-company members may view
  if (filePath.startsWith("avatars/")) {
    const ownerId = filePath.split("/")[1];
    if (!ownerId) throw new NotFoundError();
    if (ownerId === session.user.id) return;
    const shared = await prisma.membership.findFirst({
      where: {
        userId: ownerId,
        companyId: session.membership.companyId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!shared) throw new ForbiddenError();
    return;
  }

  // Documents
  const document = await prisma.document.findFirst({
    where: { filePath },
    select: { projectId: true, visibility: true },
  });
  if (document) {
    await assertProjectAccess(session, document.projectId);
    if (
      isClient &&
      document.visibility !== DocumentVisibility.CLIENT_VISIBLE
    ) {
      throw new ForbiddenError();
    }
    // Subs may only see internal docs for assigned jobs (already gated by project access)
    return;
  }

  // Photos
  const photo = await prisma.photo.findFirst({
    where: { filePath },
    select: { projectId: true, visibility: true },
  });
  if (photo) {
    await assertProjectAccess(session, photo.projectId);
    if (isClient && photo.visibility !== PhotoVisibility.CLIENT_VISIBLE) {
      throw new ForbiddenError();
    }
    return;
  }

  // Invoices — finance or client on their project (never draft/void for clients)
  const invoice = await prisma.invoice.findFirst({
    where: { filePath },
    select: { projectId: true, status: true },
  });
  if (invoice) {
    await assertProjectAccess(session, invoice.projectId);
    if (isSub) throw new ForbiddenError();
    if (isClient) {
      if (
        invoice.status === "DRAFT" ||
        invoice.status === "VOID"
      ) {
        throw new ForbiddenError();
      }
      return;
    }
    if (!sessionHasFinanceAccess(session)) {
      throw new ForbiddenError();
    }
    return;
  }

  // Purchase contracts — internal staff with project or uploader company scope
  const contract = await prisma.purchaseContract.findFirst({
    where: { filePath },
    include: { project: { select: { id: true, companyId: true } } },
  });
  if (contract) {
    if (isClient || isSub) throw new ForbiddenError();
    if (contract.projectId) {
      await assertProjectAccess(session, contract.projectId);
    } else {
      // Unlinked contract: uploader or same-company contract managers only
      if (contract.uploadedById !== session.user.id) {
        const allowed =
          role === Role.OWNER ||
          role === Role.OPERATIONS_ADMIN ||
          role === Role.PROJECT_MANAGER ||
          role === Role.SALES_MANAGER;
        if (!allowed) throw new ForbiddenError();
      }
    }
    return;
  }

  // Completion docs
  const completion = await prisma.completionDocument.findFirst({
    where: { filePath },
    select: { projectId: true },
  });
  if (completion) {
    if (isClient || isSub) throw new ForbiddenError();
    await assertProjectAccess(session, completion.projectId);
    return;
  }

  // Warranty photos
  const warrantyPhoto = await prisma.warrantyPhoto.findFirst({
    where: { filePath },
    include: { ticket: { select: { projectId: true, clientUserId: true } } },
  });
  if (warrantyPhoto) {
    await assertProjectAccess(session, warrantyPhoto.ticket.projectId);
    if (
      isClient &&
      warrantyPhoto.ticket.clientUserId !== session.user.id
    ) {
      throw new ForbiddenError();
    }
    return;
  }

  // Daily log photos — staff + author; never client
  const dailyLogPhoto = await prisma.dailyLogPhoto.findFirst({
    where: { filePath },
    include: {
      dailyLog: { select: { projectId: true, authorId: true } },
    },
  });
  if (dailyLogPhoto) {
    if (isClient) throw new ForbiddenError();
    await assertProjectAccess(session, dailyLogPhoto.dailyLog.projectId);
    if (
      isSub &&
      dailyLogPhoto.dailyLog.authorId !== session.user.id
    ) {
      throw new ForbiddenError();
    }
    return;
  }

  // Profile image stored as absolute Cloudinary URL
  const avatarUser = await prisma.user.findFirst({
    where: { image: filePath },
    select: { id: true },
  });
  if (avatarUser) {
    if (avatarUser.id === session.user.id) return;
    const shared = await prisma.membership.findFirst({
      where: {
        userId: avatarUser.id,
        companyId: session.membership.companyId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!shared) throw new ForbiddenError();
    return;
  }

  // Client home banner / house mockup — anyone with project access (incl. client)
  const heroProject = await prisma.project.findFirst({
    where: {
      OR: [{ heroImageUrl: filePath }, { heroImageUrls: { has: filePath } }],
    },
    select: { id: true },
  });
  if (heroProject) {
    await assertProjectAccess(session, heroProject.id);
    return;
  }

  // Selection material lists — staff with project access only (never client/sub)
  const materialProject = await prisma.project.findFirst({
    where: { materialListPath: filePath },
    select: { id: true },
  });
  if (materialProject) {
    if (isClient || isSub) throw new ForbiddenError();
    await assertProjectAccess(session, materialProject.id);
    return;
  }

  // Selection images — SQL so this works before a full Prisma regenerate
  const selectionImageRows = await prisma.$queryRaw<
    Array<{ projectId: string; clientVisible: boolean }>
  >`
    SELECT p."projectId" as "projectId", s."clientVisible" as "clientVisible"
    FROM "SelectionImage" i
    INNER JOIN "SelectionSection" s ON s.id = i."sectionId"
    INNER JOIN "SelectionPackage" p ON p.id = s."packageId"
    WHERE i."filePath" = ${filePath}
    LIMIT 1
  `.catch(() => [] as Array<{ projectId: string; clientVisible: boolean }>);
  const selectionImage = selectionImageRows[0];
  if (selectionImage) {
    await assertProjectAccess(session, selectionImage.projectId);
    if (isClient && !selectionImage.clientVisible) {
      throw new ForbiddenError();
    }
    if (isSub) throw new ForbiddenError();
    return;
  }

  const selectionItem = await prisma.selectionItem.findFirst({
    where: { OR: [{ imageUrl: filePath }, { attachmentPath: filePath }] },
    select: {
      sectionId: true,
      section: {
        select: {
          package: { select: { projectId: true } },
        },
      },
    },
  });
  if (selectionItem) {
    await assertProjectAccess(session, selectionItem.section.package.projectId);
    if (isClient) {
      const visible = await getClientVisibleSectionIds([
        selectionItem.section.package.projectId,
      ]);
      if (!visible.includes(selectionItem.sectionId)) {
        throw new ForbiddenError();
      }
    }
    if (isSub) throw new ForbiddenError();
    return;
  }

  // Fallback: path-prefixed folders like documents/{projectId}/...
  const projectMatch = filePath.match(
    /^(?:documents|photos|invoices|completion|warranty|materials|selections|heroes)\/([^/]+)\//
  );
  if (projectMatch?.[1]) {
    const maybeProjectId = projectMatch[1];
    // warranty folder uses ticket id — already handled above if DB row exists
    if (filePath.startsWith("warranty/")) {
      throw new NotFoundError();
    }
    const ids = await getAccessibleProjectIds(session);
    if (!ids.includes(maybeProjectId)) throw new ForbiddenError();
    if (filePath.startsWith("invoices/") && isSub) throw new ForbiddenError();
    if (
      filePath.startsWith("invoices/") &&
      !isClient &&
      !sessionHasFinanceAccess(session)
    ) {
      throw new ForbiddenError();
    }
    if (filePath.startsWith("completion/") && (isClient || isSub)) {
      throw new ForbiddenError();
    }
    if (filePath.startsWith("materials/") && (isClient || isSub)) {
      throw new ForbiddenError();
    }
    if (filePath.startsWith("selections/") && (isClient || isSub)) {
      throw new ForbiddenError();
    }
    return;
  }

  // contracts/ without DB row — deny
  throw new NotFoundError();
}
