import type { Metadata } from "next";
import { SitePageKey } from "@prisma/client";
import { LegalDoc } from "@/components/marketing/public-shell";
import { getSitePage } from "@/lib/content/load-site-pages";
import { sanitizeSiteHtml } from "@/lib/content/site-pages";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Privacy Policy · Sunbuild CRM",
  description:
    "How Sunbuild CRM collects, uses, and protects your information, including optional Google Calendar access.",
};

export default async function PrivacyPolicyPage() {
  const page = await getSitePage(SitePageKey.PRIVACY);
  return (
    <LegalDoc
      title={page.title}
      updated={formatDate(page.updatedAt)}
      html={sanitizeSiteHtml(page.bodyHtml)}
    />
  );
}
