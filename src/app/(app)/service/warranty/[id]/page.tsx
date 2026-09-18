import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, WarrantyStatus } from "@prisma/client";
import {
  addWarrantyCommentAction,
  triageWarrantyTicketAction,
  updateWarrantyStatusAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, mediaUrl } from "@/lib/utils";
import { MediaImage } from "@/components/ui/media-image";
import { loadProjectSubcontractors } from "@/lib/users/subcontractors";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ServiceWarrantyDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.SERVICE_COORDINATOR,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
  ]);
  const { id } = await params;
  const ticket = await prisma.warrantyTicket.findFirst({
    where: {
      id,
      project: { companyId: session.membership.companyId, deletedAt: null },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          municipalAddress: true,
          warrantyStart: true,
          warrantyEnd: true,
          buyer: { select: { firstName: true, lastName: true, phone: true, email: true } },
          pm: { select: { id: true, name: true } },
        },
      },
      clientUser: { select: { name: true, email: true, phone: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
      coordinator: { select: { name: true } },
      forwardedTo: { select: { name: true } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      photos: true,
    },
  });
  if (!ticket) notFound();

  const [subcontractors, staff] = await Promise.all([
    loadProjectSubcontractors({
      companyId: session.membership.companyId,
      projectIds: [ticket.projectId],
    }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        isActive: true,
        role: { in: [Role.PROJECT_MANAGER, Role.OPERATIONS_ADMIN, Role.SERVICE_COORDINATOR] },
        user: { isActive: true, deletedAt: null },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={`${ticket.ticketNumber} — ${ticket.title}`}
        description={`${ticket.project.name} · ${ticket.clientUser.name}`}
        actions={
          <Link href="/service/warranty">
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
          Opened {formatDate(ticket.createdAt)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">Issue</h2>
          <p className="mt-2 text-sm text-sb-muted">{ticket.category}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.description}</p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Client / project</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-sb-muted">Client</dt>
              <dd>
                {ticket.clientUser.name}
                {ticket.clientUser.phone ? ` · ${ticket.clientUser.phone}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-sb-muted">Address</dt>
              <dd>{ticket.project.municipalAddress || ticket.project.name}</dd>
            </div>
            <div>
              <dt className="text-sb-muted">Project manager</dt>
              <dd>{ticket.project.pm?.name ?? "Unassigned"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {ticket.photos.length > 0 ? (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold">Photos</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {ticket.photos.map((photo) => (
              <MediaImage
                key={photo.id}
                src={mediaUrl(photo.filePath)}
                alt={photo.fileName}
                className="h-28 w-full rounded-[8px] object-cover"
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Triage & forward</h2>
        <ActionForm
          action={triageWarrantyTicketAction.bind(null, ticket.id)}
          successMessage="Ticket triaged"
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
          <FormField label="Category">
            <Input name="category" defaultValue={ticket.category} />
          </FormField>
          <FormField label="Forward to" className="md:col-span-2">
            <Select
              name="forwardedToUserId"
              defaultValue={ticket.forwardedToUserId ?? ticket.pmId ?? ""}
            >
              <option value="">Keep unassigned</option>
              {staff.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name} ({m.role.replace(/_/g, " ")})
                </option>
              ))}
              {subcontractors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Triage notes" className="md:col-span-2">
            <Textarea
              name="triageNotes"
              defaultValue={ticket.triageNotes ?? ""}
              placeholder="Classification, next owner, constraints…"
            />
          </FormField>
          <FormField label="Internal comment" className="md:col-span-2">
            <Input name="comment" placeholder="Optional note on this triage" />
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save triage
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Status & assignment</h2>
        <ActionForm
          action={updateWarrantyStatusAction.bind(null, ticket.id)}
          successMessage="Warranty updated"
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
            <Select name="subcontractorId" defaultValue={ticket.subcontractorId ?? ""}>
              <option value="">Unassigned</option>
              {subcontractors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="md:col-span-2">
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Conversation</h2>
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
