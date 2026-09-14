import "server-only";
import { SitePageKey } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_SITE_PAGES,
  SITE_PAGE_META,
  sanitizeSiteHtml,
} from "@/lib/content/site-pages";

export async function ensureSitePages() {
  const keys = Object.values(SitePageKey);
  // Sequential upserts avoid unique races when multiple build workers prerender
  // /privacy and /terms at the same time.
  for (const key of keys) {
    try {
      await prisma.sitePage.upsert({
        where: { key },
        create: {
          key,
          title: SITE_PAGE_META[key].title,
          bodyHtml: sanitizeSiteHtml(DEFAULT_SITE_PAGES[key]),
        },
        update: {},
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code !== "P2002") throw err;
      // Another worker created the row — treat as success.
    }
  }
}

export async function getSitePage(key: SitePageKey) {
  try {
    await ensureSitePages();
    const page = await prisma.sitePage.findUnique({ where: { key } });
    if (page) return page;
  } catch (err) {
    console.warn("[site-page] Database unreachable during build, using default content:", err instanceof Error ? err.message : String(err));
  }
  return {
    key,
    title: SITE_PAGE_META[key].title,
    bodyHtml: sanitizeSiteHtml(DEFAULT_SITE_PAGES[key]),
    updatedAt: new Date(),
    updatedById: null as string | null,
  };
}

export async function listSitePages() {
  await ensureSitePages();
  return prisma.sitePage.findMany({
    orderBy: { key: "asc" },
    include: {
      updatedBy: { select: { id: true, name: true, email: true } },
    },
  });
}
