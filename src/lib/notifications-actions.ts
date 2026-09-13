"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

export async function markNotificationReadAction(notificationId: string) {
  const session = await requireSession();
  await markNotificationRead(session, notificationId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  await markAllNotificationsRead(session);
  revalidatePath("/notifications");
}
