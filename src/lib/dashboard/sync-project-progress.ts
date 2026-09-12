import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { computeProjectProgress } from "@/lib/dashboard/progress";

/**
 * Recalculate and persist Project.progressPercent from milestones / tasks / schedule.
 * Used after task, milestone, and schedule mutations so every role sees the same %.
 */
export async function syncProjectProgress(projectId: string): Promise<number> {
  const [project, milestones, scheduleItems, tasks] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { progressPercent: true, status: true },
    }),
    prisma.milestone.findMany({
      where: { projectId },
      select: { status: true },
    }),
    prisma.scheduleItem.findMany({
      where: { projectId },
      select: { status: true },
    }),
    prisma.task.findMany({
      where: { projectId },
      select: { status: true },
    }),
  ]);

  const progressPercent = computeProjectProgress({
    progressPercent: project?.progressPercent ?? 0,
    status: project?.status,
    milestones,
    scheduleItems,
    tasks,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { progressPercent },
  });

  return progressPercent;
}

/** Batch compute live progress for dashboards / lists (does not write). */
export async function loadProgressByProjectIds(
  projectIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      milestones: { select: { status: true } },
      scheduleItems: { select: { status: true } },
      tasks: { select: { status: true } },
    },
  });

  for (const p of projects) {
    map.set(
      p.id,
      computeProjectProgress({
        progressPercent: p.progressPercent,
        status: p.status,
        milestones: p.milestones,
        scheduleItems: p.scheduleItems,
        tasks: p.tasks,
      })
    );
  }

  return map;
}

/** Invalidate every surface that shows project progress across roles. */
export function revalidateProjectProgressSurfaces(projectId: string) {
  revalidatePath("/pm");
  revalidatePath("/owner");
  revalidatePath("/ceo");
  revalidatePath("/client");
  revalidatePath("/sub");
  revalidatePath("/pm/tasks");
  revalidatePath("/pm/schedule");
  revalidatePath("/pm/projects");
  revalidatePath(`/pm/projects/${projectId}`);
  revalidatePath(`/sub/jobs/${projectId}`);
  revalidatePath("/owner/jobs");
  revalidatePath("/client/schedule");
}
