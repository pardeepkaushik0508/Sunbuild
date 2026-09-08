"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireSession,
  assertProjectAccess,
  getAccessibleProjectIds,
} from "@/lib/session";
import { AppError } from "@/lib/errors";
import { PM_PROJECT_COOKIE } from "@/lib/pm/project-context";
import { writeAudit } from "@/lib/audit";

export async function setSelectedProjectAction(form: FormData) {
  const session = await requireSession();
  const projectId = String(form.get("projectId") ?? "").trim();
  const returnTo = String(form.get("returnTo") ?? "/pm").trim() || "/pm";

  if (!projectId) throw new AppError("Project is required");
  await assertProjectAccess(session, projectId);

  const jar = await cookies();
  jar.set(PM_PROJECT_COOKIE, projectId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    projectId,
    action: "PM_PROJECT_SELECTED",
    entityType: "Project",
    entityId: projectId,
  });

  revalidatePath("/pm");
  revalidatePath("/pm/tasks");
  revalidatePath("/pm/schedule");
  revalidatePath("/pm/daily-logs");
  revalidatePath("/pm/rfis");
  revalidatePath("/pm/change-orders");
  revalidatePath("/pm/selections");
  revalidatePath("/pm/projects");

  const url = returnTo.includes("projectId=")
    ? returnTo
    : `${returnTo}${returnTo.includes("?") ? "&" : "?"}projectId=${projectId}`;
  redirect(url);
}

export async function clearSelectedProjectAction() {
  const session = await requireSession();
  void session;
  const jar = await cookies();
  jar.delete(PM_PROJECT_COOKIE);
  revalidatePath("/pm");
  redirect("/pm/projects");
}

export async function listSelectableProjectsAction() {
  const session = await requireSession();
  const ids = await getAccessibleProjectIds(session);
  return ids;
}
