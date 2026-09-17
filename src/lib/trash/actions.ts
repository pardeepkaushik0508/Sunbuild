"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import {
  softDeleteUser,
  softDeleteProject,
  restoreUserFromTrash,
  restoreProjectFromTrash,
  permanentlyDeleteUser,
  permanentlyDeleteProject,
} from "@/lib/trash/service";

function canTrashRole(role: Role) {
  return (
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.CEO
  );
}

async function requireTrashActor() {
  const session = await requireSession();
  if (!canTrashRole(session.membership.role)) {
    requireCapability(session, "manageUsers");
  }
  if (!canTrashRole(session.membership.role)) {
    throw new AppError("You do not have permission to manage trash");
  }
  return session;
}

export async function softDeleteUserAction(userId: string) {
  const session = await requireTrashActor();
  await softDeleteUser({
    userId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/owner/users");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}

export async function softDeleteProjectAction(projectId: string) {
  const session = await requireTrashActor();
  await softDeleteProject({
    projectId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/pm/projects");
  revalidatePath("/owner/jobs");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}

export async function restoreUserAction(userId: string) {
  const session = await requireTrashActor();
  await restoreUserFromTrash({
    userId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/owner/users");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}

export async function restoreProjectAction(projectId: string) {
  const session = await requireTrashActor();
  await restoreProjectFromTrash({
    projectId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/pm/projects");
  revalidatePath("/owner/jobs");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}

export async function permanentlyDeleteUserAction(userId: string) {
  const session = await requireTrashActor();
  await permanentlyDeleteUser({
    userId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/owner/users");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}

export async function permanentlyDeleteProjectAction(projectId: string) {
  const session = await requireTrashActor();
  await permanentlyDeleteProject({
    projectId,
    companyId: session.membership.companyId,
    actorUserId: session.user.id,
    actorRole: session.membership.role,
  });
  revalidatePath("/pm/projects");
  revalidatePath("/owner/jobs");
  revalidatePath("/owner/trash");
  return { ok: true as const };
}
