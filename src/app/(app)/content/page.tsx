import { Role } from "@prisma/client";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { SitePagesManager } from "@/components/content/site-pages-manager";
import { requireRole } from "@/lib/session";
import { listSitePages } from "@/lib/content/load-site-pages";

export default async function SiteContentPage() {
  await requireRole([Role.OWNER, Role.CEO, Role.OPERATIONS_ADMIN]);
  const pages = await listSitePages();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site content"
        description="Edit public Privacy Policy and Terms of Service with the rich text editor"
        icon={<FileText size={18} />}
      />
      <SitePagesManager
        pages={pages.map((p) => ({
          key: p.key,
          title: p.title,
          bodyHtml: p.bodyHtml,
          updatedAt: p.updatedAt,
          updatedBy: p.updatedBy,
        }))}
      />
    </div>
  );
}
