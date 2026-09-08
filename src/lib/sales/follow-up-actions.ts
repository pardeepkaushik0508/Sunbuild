"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Priority } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireSession,
  assertLeadAccess,
  assertCompanyUser,
} from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import {
  ACTION_RATE,
  assertRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

function formString(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function rateLimitAction(userId: string, kind: string) {
  const h = await headers();
  assertRateLimit(
    clientKeyFromHeaders(h, `${kind}:${userId}`),
    ACTION_RATE.limit,
    ACTION_RATE.windowMs
  );
}

export async function createSalesFollowUpAction(form: FormData) {
  const session = await requireSession();
  requireCapability(session, "manageLeads");
  await rateLimitAction(session.user.id, "lead-note");

  const leadId = formString(form, "leadId");
  const title = formString(form, "title");
  const dueDate = formString(form, "dueDate");
  if (!leadId) throw new AppError("Lead is required");
  if (!title) throw new AppError("Title is required");
  if (!dueDate) throw new AppError("Due date is required");

  await assertLeadAccess(session, leadId);

  const dueTime = formString(form, "dueTime");
  const dueAt = new Date(
    dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T09:00:00`
  );
  if (Number.isNaN(dueAt.getTime())) throw new AppError("Invalid due date");

  const assigneeId = formString(form, "assigneeId") || session.user.id;
  if (assigneeId !== session.user.id) {
    await assertCompanyUser(session, assigneeId);
  }

  const priority = (formString(form, "priority") || Priority.MEDIUM) as Priority;
  const activityType = formString(form, "activityType") || "FOLLOW_UP";
  const description =
    formString(form, "description") || `Follow-up scheduled for ${title}`;

  await prisma.$transaction(async (tx) => {
    await tx.leadActivity.create({
      data: {
        leadId,
        userId: assigneeId,
        type: activityType,
        title,
        content: description,
        activityDate: new Date(),
        dueAt,
        priority,
      },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: {
        followUpAt: dueAt,
        nextAction: title,
        flaggedForFollowUp: true,
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath("/sales/leads");
  revalidatePath(`/sales/leads/${leadId}`);
  revalidatePath("/sales/activities");
}
