import { revalidatePath } from "next/cache";

/** Invalidate PM + client surfaces that read project photos. */
export function revalidateProjectPhotos(projectId?: string | null) {
  revalidatePath("/pm/photos");
  revalidatePath("/client");
  revalidatePath("/client/photos");
  revalidatePath("/sub");
  if (projectId) {
    revalidatePath(`/pm/projects/${projectId}`);
    revalidatePath(`/sub/jobs/${projectId}`);
    revalidatePath(`/client?projectId=${projectId}`);
    revalidatePath(`/client/photos?projectId=${projectId}`);
  }
}

export function revalidateProjectSelections(projectId?: string | null) {
  revalidatePath("/pm/selections");
  revalidatePath("/client/selections");
  revalidatePath("/client");
  if (projectId) {
    revalidatePath(`/pm/projects/${projectId}`);
    revalidatePath(`/pm/selections?projectId=${projectId}`);
    revalidatePath(`/client/selections?projectId=${projectId}`);
  }
}
