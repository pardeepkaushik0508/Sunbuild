import Link from "next/link";
import {
  ChangeOrderStatus,
  DocumentVisibility,
  PhotoVisibility,
  ProjectStatus,
  Role,
} from "@prisma/client";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Card, EmptyState, ProgressBar } from "@/components/ui/card";
import { StatusBadge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, fullName, whatsappLink } from "@/lib/utils";
import { resolveScheduleDisplayStatus } from "@/lib/schedule/display-status";
import { resolveClientProject } from "@/lib/client/project";

export default async function ClientHomePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireRole(Role.CLIENT);
  const sp = await searchParams;
  const project = await resolveClientProject(session, sp.projectId);
  const ids = await getAccessibleProjectIds(session);

  if (!project) {
    return (
      <EmptyState
        title="No project assigned"
        description="Your home build will appear here once your account is linked."
      />
    );
  }

  const [full, projects] = await Promise.all([
    prisma.project.findFirst({
      where: { id: project.id },
      include: {
        buyer: true,
        pm: true,
        milestones: { orderBy: { sortOrder: "asc" }, take: 5 },
        documents: {
          where: { visibility: DocumentVisibility.CLIENT_VISIBLE },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        photos: {
          where: { visibility: PhotoVisibility.CLIENT_VISIBLE },
          orderBy: { createdAt: "desc" },
          take: 6,
        },
        changeOrders: {
          where: { status: ChangeOrderStatus.PENDING_CLIENT },
          take: 5,
        },
        selectionPackages: {
          where: { status: { not: "DRAFT" } },
          include: {
            sections: {
              where: {
                status: {
                  in: ["DRAFT", "CHANGES_REQUESTED", "SUBMITTED"],
                },
              },
              take: 3,
            },
          },
          take: 2,
        },
        invoices: {
          where: { status: { notIn: ["PAID", "VOID", "DRAFT"] } },
          orderBy: { dueDate: "asc" },
          take: 3,
        },
      },
    }),
    ids.length > 1
      ? prisma.project.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([{ id: project.id, name: project.name }]),
  ]);

  if (!full) {
    return (
      <EmptyState
        title="No project assigned"
        description="Your home build will appear here once your account is linked."
      />
    );
  }

  const wa = whatsappLink(
    full.pm?.phone,
    `Hi ${full.pm?.name ?? "PM"}, regarding ${full.name}`
  );

  const openSelections = full.selectionPackages.flatMap((p) => p.sections);

  return (
    <div className="space-y-5">
      <ClientPortalBanner
        projectName={full.name}
        statusLabel={full.status.replace(/_/g, " ")}
        projects={projects}
        activeProjectId={full.id}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-3 gap-1 p-2">
            {full.photos.length > 0 ? (
              full.photos.slice(0, 3).map((ph) => (
                <Link
                  key={ph.id}
                  href={`/client/photos?projectId=${full.id}`}
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${ph.filePath}`}
                    alt={ph.caption || ph.fileName}
                    className="h-40 w-full rounded-xl object-cover"
                  />
                </Link>
              ))
            ) : (
              <>
                <div className="h-40 rounded-xl bg-gradient-to-br from-stone-200 to-stone-300" />
                <div className="h-40 rounded-xl bg-gradient-to-br from-amber-100 to-orange-200" />
                <div className="h-40 rounded-xl bg-gradient-to-br from-slate-200 to-slate-400" />
              </>
            )}
          </div>
          {full.photos.length > 0 ? (
            <div className="border-t border-sb-border px-3 py-2">
              <Link
                href={`/client/photos?projectId=${full.id}`}
                className="text-sm font-medium text-sb-ink underline"
              >
                View all photos
              </Link>
            </div>
          ) : null}
        </Card>

        <Card className="relative overflow-hidden bg-[linear-gradient(135deg,#1f2937_0%,#374151_100%)] p-0 text-white">
          <div className="relative z-10 p-6">
            <p className="sb-brand text-2xl text-sb-orange">{full.name}</p>
            <p className="mt-2 text-sm text-white/80">
              {full.municipalAddress || "Address pending"}
            </p>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>Progress</span>
                <span className="font-semibold">{full.progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-sb-orange"
                  style={{ width: `${full.progressPercent}%` }}
                />
              </div>
            </div>
            <p className="mt-4 text-sm text-white/80">
              Next milestone:{" "}
              <span className="font-medium text-white">
                {full.milestones.find((m) => m.status !== "COMPLETED")?.title ||
                  "—"}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
              <div className="text-xs text-white/70">
                <p>PM: {full.pm?.name || "—"}</p>
                <p>Status: {full.status.replace(/_/g, " ")}</p>
              </div>
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <Mail size={14} />
                    Message PM
                  </Button>
                </a>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  Message PM
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <h3 className="mb-3 text-base font-semibold text-sb-orange">
            Needs your attention
          </h3>
          <div className="space-y-3">
            {full.changeOrders.length === 0 &&
            openSelections.length === 0 &&
            full.invoices.length === 0 ? (
              <p className="text-sm text-sb-muted">Nothing urgent right now.</p>
            ) : null}
            {full.changeOrders.map((co) => (
              <div key={co.id} className="rounded-xl border border-sb-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{co.title}</p>
                    <p className="text-xs text-sb-muted">
                      Change order awaiting your action
                    </p>
                  </div>
                  <StatusBadge tone="danger">URGENT</StatusBadge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href={`/client/change-orders?projectId=${full.id}`}>
                    <Button size="sm" variant="outline">
                      REVIEW
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
            {openSelections.map((sec) => (
              <div
                key={sec.id}
                className="rounded-xl border border-sb-border p-3"
              >
                <p className="text-sm font-semibold">{sec.name}</p>
                <p className="text-xs text-sb-muted">Selection needs review</p>
                <div className="mt-3">
                  <Link href="/client/selections">
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
            {full.invoices.map((inv) => (
              <div
                key={inv.id}
                className="rounded-xl border border-sb-border p-3"
              >
                <p className="text-sm font-semibold">
                  Invoice {inv.invoiceNumber}
                </p>
                <p className="text-xs text-sb-muted">
                  Due {formatDate(inv.dueDate)}
                </p>
                <div className="mt-3">
                  <Link href="/client/payments">
                    <Button size="sm" variant="outline">
                      View
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-base font-semibold">Project Documents</h3>
            <div className="space-y-2">
              {full.documents.length === 0 ? (
                <p className="text-sm text-sb-muted">No client documents yet.</p>
              ) : (
                full.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-sb-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-sb-muted">
                        {doc.category} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <a
                      href={`/api/files/${doc.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="outline">
                        View
                      </Button>
                    </a>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Build Feed</h3>
              <Link
                href={`/client/photos?projectId=${full.id}`}
                className="text-xs font-medium text-sb-ink underline"
              >
                All photos
              </Link>
            </div>
            {full.photos.length === 0 ? (
              <p className="text-sm text-sb-muted">
                Progress photos from your project manager will appear here.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {full.photos.map((ph) => (
                  <Link
                    key={ph.id}
                    href={`/client/photos?projectId=${full.id}`}
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/${ph.filePath}`}
                      alt={ph.caption || ""}
                      className="aspect-square rounded-lg object-cover"
                    />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 text-base font-semibold">Upcoming Milestones</h3>
            <div className="space-y-2">
              {full.milestones.length === 0 ? (
                <p className="text-sm text-sb-muted">No milestones yet.</p>
              ) : (
                full.milestones.map((m) => {
                  const display = resolveScheduleDisplayStatus(
                    m.status,
                    m.dueDate
                  );
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-xl border border-sb-border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-sb-muted">
                          {formatDate(m.dueDate)}
                        </p>
                      </div>
                      <StatusBadge tone={statusTone(display)}>
                        {display.replace(/_/g, " ").toLowerCase()}
                      </StatusBadge>
                    </div>
                  );
                })
              )}
            </div>
            <Link
              href="/client/schedule"
              className="mt-3 inline-block text-sm underline"
            >
              View full schedule
            </Link>
          </Card>

          <Card>
            <h3 className="mb-3 text-base font-semibold">Team Contacts</h3>
            {full.pm ? (
              <div className="flex items-center justify-between rounded-xl border border-sb-border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sb-purple/15 text-sm font-semibold text-sb-purple">
                    {full.pm.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{full.pm.name}</p>
                    <p className="text-xs text-sb-muted">Project Manager</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {full.pm.phone ? (
                    <a
                      href={`tel:${full.pm.phone}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sb-purple/30 text-sb-purple"
                    >
                      <Phone size={14} />
                    </a>
                  ) : null}
                  {full.pm.email ? (
                    <a
                      href={`mailto:${full.pm.email}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sb-purple/30 text-sb-purple"
                    >
                      <Mail size={14} />
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sb-green-border text-sb-green"
                    >
                      <MessageCircle size={14} />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-sb-muted">PM not assigned yet.</p>
            )}
            {full.status === ProjectStatus.HANDED_OVER || full.warrantyStart ? (
              <Link href="/client/warranty" className="mt-3 inline-block">
                <Button variant="orange" size="sm">
                  Open Warranty
                </Button>
              </Link>
            ) : null}
          </Card>
        </div>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Build progress</h3>
          <span className="text-sm text-sb-muted">
            Buyer:{" "}
            {full.buyer
              ? fullName(full.buyer.firstName, full.buyer.lastName)
              : "—"}
          </span>
        </div>
        <ProgressBar value={full.progressPercent} color="orange" />
      </Card>
    </div>
  );
}
