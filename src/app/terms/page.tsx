import type { Metadata } from "next";
import { SitePageKey } from "@prisma/client";
import { LegalDoc } from "@/components/marketing/public-shell";
import { getSitePage } from "@/lib/content/load-site-pages";
import { sanitizeSiteHtml } from "@/lib/content/site-pages";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms of Service · Sunbuild CRM",
  description:
    "Terms governing use of Sunbuild CRM, including optional Google Calendar integration.",
};

export default async function TermsOfServicePage() {
  const page = await getSitePage(SitePageKey.TERMS);
  return (
    <LegalDoc
      title={page.title}
      updated={formatDate(page.updatedAt)}
      html={sanitizeSiteHtml(page.bodyHtml)}
    />
  );
}
