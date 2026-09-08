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
import { hasFinanceAccess } from "@/lib/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

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
    if (!hasFinanceAccess(role, session.membership.financeAccess)) {
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

  // Fallback: path-prefixed folders like documents/{projectId}/...
  const projectMatch = filePath.match(
    /^(?:documents|photos|invoices|completion|warranty|materials)\/([^/]+)\//
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
      !hasFinanceAccess(role, session.membership.financeAccess)
    ) {
      throw new ForbiddenError();
    }
    if (filePath.startsWith("completion/") && (isClient || isSub)) {
      throw new ForbiddenError();
    }
    if (filePath.startsWith("materials/") && (isClient || isSub)) {
      throw new ForbiddenError();
    }
    return;
  }

  // contracts/ without DB row — deny
  throw new NotFoundError();
}
