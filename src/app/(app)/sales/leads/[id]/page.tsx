import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadStatus, Role } from "@prisma/client";
import {
  addLeadNoteAction,
  convertLeadAction,
  updateLeadAction,
} from "@/lib/actions";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, fullName, whatsappLink } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LeadDetailPage({ params }: PageProps) {
  const session = await requireRole([Role.SALES_MANAGER, Role.OWNER]);
  const { id } = await params;
  const companyId = session.membership.companyId;

  const lead = await prisma.lead.findFirst({
    where: {
      id,
      companyId,
      ...(session.membership.role === Role.SALES_MANAGER
        ? {
            OR: [
              { assigneeId: session.user.id },
              { assigneeId: null },
            ],
          }
        : {}),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      activities: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) notFound();

  const assignees = await prisma.membership.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [Role.SALES_MANAGER, Role.OWNER] },
    },
    include: { user: { select: { id: true, name: true } } },
  });

  const wa = whatsappLink(lead.phone, `Hi ${lead.firstName}, this is Sunview Homes.`);

  return (
    <div>
      <PageHeader
        title={fullName(lead.firstName, lead.lastName)}
        description={`Lead created ${formatDate(lead.createdAt)} by ${lead.createdBy.name}`}
        actions={
          <>
            <Link href="/sales/leads">
              <Button variant="outline" size="sm">
                Back to leads
              </Button>
            </Link>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  WhatsApp
                </Button>
              </a>
            ) : null}
          </>
        }
      />

      <div className="mb-4">
        <StatusBadge tone={statusTone(lead.status)}>
          {lead.status.replace(/_/g, " ")}
        </StatusBadge>
        {lead.convertedAt ? (
          <span className="ml-2 text-sm text-sb-muted">
            Converted {formatDate(lead.convertedAt)}
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
            Edit lead
          </h2>
          <form
            action={updateLeadAction.bind(null, lead.id)}
            className="mt-4 grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name">
                <Input name="firstName" defaultValue={lead.firstName} required />
              </FormField>
              <FormField label="Last name">
                <Input name="lastName" defaultValue={lead.lastName} required />
              </FormField>
            </div>
            <FormField label="Email">
              <Input name="email" type="email" defaultValue={lead.email ?? ""} />
            </FormField>
            <FormField label="Phone">
              <Input name="phone" type="tel" defaultValue={lead.phone ?? ""} />
            </FormField>
            <FormField label="Address">
              <Input name="address" defaultValue={lead.address ?? ""} />
            </FormField>
            <FormField label="Status">
              <Select name="status" defaultValue={lead.status}>
                {Object.values(LeadStatus).map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Assignee">
              <Select
                name="assigneeId"
                defaultValue={lead.assigneeId ?? ""}
              >
                <option value="">Unassigned</option>
                {assignees.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Estimated value">
                <Input
                  name="estimatedValue"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={lead.estimatedValue ?? ""}
                />
              </FormField>
              <FormField label="Source">
                <Input name="source" defaultValue={lead.source ?? ""} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Next action">
                <Input name="nextAction" defaultValue={lead.nextAction ?? ""} />
              </FormField>
              <FormField label="Follow-up date">
                <Input
                  name="followUpAt"
                  type="date"
                  defaultValue={
                    lead.followUpAt
                      ? lead.followUpAt.toISOString().slice(0, 10)
                      : ""
                  }
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-sb-ink">
              <input
                type="checkbox"
                name="flaggedForFollowUp"
                defaultChecked={lead.flaggedForFollowUp}
                className="h-4 w-4 rounded border-sb-border"
              />
              Flag for follow-up
            </label>
            <FormField label="Notes">
              <Textarea name="notes" defaultValue={lead.notes ?? ""} />
            </FormField>
            <Button type="submit">Save changes</Button>
          </form>
        </Card>

        <div className="space-y-6">
          {lead.status !== LeadStatus.WON && lead.status !== LeadStatus.LOST ? (
            <Card>
              <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
                Convert to project
              </h2>
              <p className="mt-2 text-sm text-sb-muted">
                Creates a buyer record and pre-construction project, then opens
                the contract workflow.
              </p>
              <form action={convertLeadAction.bind(null, lead.id)} className="mt-4">
                <Button type="submit">Convert lead</Button>
              </form>
            </Card>
          ) : lead.projectId ? (
            <Card>
              <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
                Linked project
              </h2>
              <Link
                href={`/pm/projects/${lead.projectId}`}
                className="mt-2 inline-block text-sm font-medium text-sb-black hover:underline"
              >
                View project →
              </Link>
            </Card>
          ) : null}

          <Card>
            <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-sb-black">
              Activity
            </h2>
            <form
              action={addLeadNoteAction.bind(null, lead.id)}
              className="mt-4 space-y-3"
            >
              <FormField label="Add note">
                <Textarea name="content" required placeholder="Call summary, next steps..." />
              </FormField>
              <Button type="submit" size="sm">
                Add note
              </Button>
            </form>
            <ul className="mt-6 space-y-4">
              {lead.activities.length === 0 ? (
                <li className="text-sm text-sb-muted">No activity yet.</li>
              ) : (
                lead.activities.map((activity) => (
                  <li
                    key={activity.id}
                    className="rounded-[10px] border border-sb-border bg-sb-canvas/40 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-sb-ink">
                      {activity.title?.trim() ||
                        activity.type.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-sm text-sb-ink">{activity.content}</p>
                    <p className="mt-1 text-xs text-sb-muted">
                      {activity.user.name} ·{" "}
                      {formatDate(activity.activityDate ?? activity.createdAt)}
                      {activity.dueAt
                        ? ` · Due ${formatDate(activity.dueAt)}`
                        : ""}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
