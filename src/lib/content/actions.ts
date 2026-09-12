"use server";

import { revalidatePath } from "next/cache";
import { SitePageKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireCapability } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import {
  SITE_PAGE_META,
  sanitizeSiteHtml,
} from "@/lib/content/site-pages";
import { ensureSitePages } from "@/lib/content/load-site-pages";

export async function saveSitePageAction(input: {
  key: SitePageKey;
  title: string;
  bodyHtml: string;
}) {
  const session = await requireSession();
  requireCapability(session, "manageSiteContent");

  if (!Object.values(SitePageKey).includes(input.key)) {
    throw new AppError("Invalid page");
  }

  const title = input.title.trim();
  if (title.length < 2 || title.length > 160) {
    throw new AppError("Title must be 2–160 characters");
  }

  const bodyHtml = sanitizeSiteHtml(input.bodyHtml || "");
  if (!bodyHtml) {
    throw new AppError("Content cannot be empty");
  }

  await ensureSitePages();

  const page = await prisma.sitePage.update({
    where: { key: input.key },
    data: {
      title,
      bodyHtml,
      updatedById: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    companyId: session.membership.companyId,
    action: "SITE_PAGE_UPDATED",
    entityType: "SitePage",
    entityId: page.id,
    metadata: { key: input.key },
  });

  const meta = SITE_PAGE_META[input.key];
  revalidatePath(meta.publicPath);
  revalidatePath("/content");
  revalidatePath("/owner/content");
  revalidatePath("/ceo/content");
  revalidatePath("/admin/content");

  return { ok: true as const };
}
