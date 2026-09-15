import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, WarrantyStatus } from "@prisma/client";
import {
  addWarrantyCommentAction,
  updateWarrantyStatusAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, mediaUrl } from "@/lib/utils";
import { MediaImage } from "@/components/ui/media-image";
import { loadProjectSubcontractors } from "@/lib/users/subcontractors";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PMWarrantyDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const ticket = await prisma.warrantyTicket.findFirst({
    where: { id, projectId: { in: projectIds } },
    include: {
      project: { select: { id: true, name: true, warrantyStart: true, warrantyEnd: true } },
      clientUser: { select: { name: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      photos: true,
    },
  });
  if (!ticket) notFound();

  const subcontractors = await loadProjectSubcontractors({
    companyId: session.membership.companyId,
    projectIds: [ticket.projectId],
  });

  return (
    <div>
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        description={`${ticket.project.name} · ${ticket.clientUser.name}`}
        actions={
          <Link href="/pm/warranty">
            <Button variant="outline" size="sm">
              All tickets
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(ticket.status)}>
          {ticket.status.replace(/_/g, " ")}
        </StatusBadge>
        <span className="text-sm text-sb-muted">
          {ticket.eligible ? "Eligible" : "Not eligible"} · Opened{" "}
          {formatDate(ticket.createdAt)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold">
            Issue
          </h2>
          <p className="mt-2 text-sm text-sb-muted">{ticket.category}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.description}</p>
          {ticket.resolution ? (
            <p className="mt-3 text-sm">Resolution: {ticket.resolution}</p>
          ) : null}
        </Card>
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold">
            Details
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-sb-muted">Assigned subcontractor</dt>
              <dd>{ticket.subcontractor?.name ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-sb-muted">Warranty window</dt>
              <dd>
                {formatDate(ticket.project.warrantyStart)} –{" "}
                {formatDate(ticket.project.warrantyEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-sb-muted">Updated</dt>
              <dd>{formatDate(ticket.updatedAt)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {ticket.photos.length > 0 ? (
        <Card className="mt-6">
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold">
            Photos
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
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
        </Card>
      ) : null}

      <Card className="mt-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold">
          Update ticket
        </h2>
        <ActionForm
          action={updateWarrantyStatusAction.bind(null, ticket.id)}
          successMessage="Warranty ticket updated"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Status">
            <Select name="status" defaultValue={ticket.status}>
              {Object.values(WarrantyStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Assign subcontractor">
            <Select
              name="subcontractorId"
              defaultValue={ticket.subcontractorId ?? ""}
            >
              <option value="">Unassigned</option>
              {subcontractors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Resolution" className="md:col-span-2">
            <Textarea name="resolution" defaultValue={ticket.resolution ?? ""} />
          </FormField>
          <FormField label="Internal comment" className="md:col-span-2">
            <Input name="comment" placeholder="Optional note" />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-6">
        <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold">
          Conversation
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
                <p className="whitespace-pre-wrap">{comment.content}</p>
                <p className="mt-1 text-xs text-sb-muted">
                  {comment.user.name} · {formatDate(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ActionForm
          action={addWarrantyCommentAction.bind(null, ticket.id)}
          successMessage="Comment added"
          className="mt-4 space-y-3"
        >
          <FormField label="Add comment">
            <Textarea name="content" required />
          </FormField>
          <SubmitButton size="sm" pendingLabel="Saving…">
            Add comment
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
