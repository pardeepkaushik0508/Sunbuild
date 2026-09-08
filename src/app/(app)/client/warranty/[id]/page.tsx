import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientWarrantyDetailPage({ params }: PageProps) {
  const session = await requireRole(Role.CLIENT);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const ticket = await prisma.warrantyTicket.findFirst({
    where: {
      id,
      projectId: { in: projectIds },
      clientUserId: session.user.id,
    },
    include: {
      project: { select: { name: true } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      photos: true,
    },
  });

  if (!ticket) notFound();

  return (
    <div>
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        description={`${ticket.project.name} · ${ticket.category}`}
        actions={
          <Link href="/client/warranty">
            <Button variant="outline" size="sm">
              All tickets
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <StatusBadge tone={statusTone(ticket.status)}>
          {ticket.status.replace(/_/g, " ")}
        </StatusBadge>
        <span className="ml-2 text-sm text-sb-muted">
          Opened {formatDate(ticket.createdAt)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Description
          </h2>
          <p className="mt-4 text-sm whitespace-pre-wrap">{ticket.description}</p>
          {ticket.resolution ? (
            <div className="mt-4 rounded-[10px] bg-green-50 px-4 py-3 text-sm">
              <p className="font-medium text-sb-success">Resolution</p>
              <p className="mt-1">{ticket.resolution}</p>
              {ticket.closedAt ? (
                <p className="mt-1 text-xs text-sb-muted">
                  Closed {formatDate(ticket.closedAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        {ticket.photos.length > 0 ? (
          <Card>
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
              Photos
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {ticket.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={`/api/files/${photo.filePath}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square overflow-hidden rounded-[10px] bg-sb-canvas"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${photo.filePath}`}
                    alt={photo.fileName}
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <Card className="mt-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
          Comments
        </h2>
        {ticket.comments.length === 0 ? (
          <p className="mt-4 text-sm text-sb-muted">No comments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ticket.comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-[10px] border border-sb-border bg-sb-canvas/40 px-4 py-3 text-sm"
              >
                <p>{comment.content}</p>
                <p className="mt-1 text-xs text-sb-muted">
                  {comment.user.name} · {formatDate(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
