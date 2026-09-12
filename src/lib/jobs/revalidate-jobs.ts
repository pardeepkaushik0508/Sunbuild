import { revalidatePath } from "next/cache";

/** Invalidate every surface that reads project/job records. */
export function revalidateJobsSurfaces(projectId?: string | null) {
  revalidatePath("/owner");
  revalidatePath("/owner/jobs");
  revalidatePath("/owner/jobs/budget");
  revalidatePath("/owner/jobs/reports");
  revalidatePath("/owner/users");
  revalidatePath("/pm");
  revalidatePath("/pm/projects");
  revalidatePath("/pm/projects/budget");
  revalidatePath("/pm/projects/reports");
  revalidatePath("/pm/change-orders");
  revalidatePath("/pm/schedule");
  revalidatePath("/pm/tasks");
  revalidatePath("/ceo");
  revalidatePath("/admin");
  revalidatePath("/bookkeeper");
  revalidatePath("/bookkeeper/invoices");
  revalidatePath("/client");
  revalidatePath("/client/change-orders");
  revalidatePath("/client/payments");
  if (projectId) {
    revalidatePath(`/pm/projects/${projectId}`);
  }
}
