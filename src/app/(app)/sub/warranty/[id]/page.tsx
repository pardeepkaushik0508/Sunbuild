import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, mediaUrl } from "@/lib/utils";
import { MediaImage } from "@/components/ui/media-image";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SubWarrantyDetailPage({ params }: PageProps) {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const { id } = await params;

  const ticket = await prisma.warrantyTicket.findFirst({
    where: {
      id,
      subcontractorId: session.user.id,
      project: { companyId: session.membership.companyId },
    },
    include: {
      project: { select: { name: true, municipalAddress: true } },
      photos: true,
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) notFound();

  return (
    <div>
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        description={ticket.project.name}
        actions={
          <Link href="/sub">
            <Button variant="outline" size="sm">
              Jobs
            </Button>
          </Link>
        }
      />
      <StatusBadge tone={statusTone(ticket.status)}>
        {ticket.status.replace(/_/g, " ")}
      </StatusBadge>
      <Card className="mt-4">
        <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        {ticket.project.municipalAddress ? (
          <p className="mt-2 text-sm text-sb-muted">
            {ticket.project.municipalAddress}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-sb-muted">
          Updated {formatDate(ticket.updatedAt)}
        </p>
      </Card>
      {ticket.photos.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ticket.photos.map((photo) => (
            <a
              key={photo.id}
              href={mediaUrl(photo.filePath) ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <MediaImage
                src={photo.filePath}
                alt={photo.fileName}
                aspectClassName="aspect-square"
                width={240}
                height={240}
              />
            </a>
          ))}
        </div>
      ) : null}
      {ticket.comments.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-semibold">History</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {ticket.comments.map((c) => (
              <li key={c.id}>
                <p>{c.content}</p>
                <p className="text-xs text-sb-muted">
                  {c.user.name} · {formatDate(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
