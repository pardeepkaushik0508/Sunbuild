import Link from "next/link";
import {
  ChangeOrderStatus,
  DocumentVisibility,
  PhotoVisibility,
  Priority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Card, EmptyState, ProgressBar } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientPortalBanner } from "@/components/client/portal-banner";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import {
  DashboardCalendarSlot,
  DashboardWidgetRow,
} from "@/components/dashboard/dashboard-widget-row";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate, fullName, mediaUrl, whatsappLink } from "@/lib/utils";
import { resolveClientProject } from "@/lib/client/project";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { buildGanttTree } from "@/lib/dashboard/gantt-tree";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";
import { mergeExternalGoogleEvents } from "@/lib/google/merge-events";
import { getPublicConnection } from "@/lib/google/auth-client";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";
import { ProjectPhotoGallery } from "@/components/client/project-photo-gallery";
import { ClientHomeHero } from "@/components/client/home-hero";
import {
  CLIENT_SELECTION_PACKAGE_STATUS_WHERE,
  getClientVisibleSectionIds,
  idInFilter,
} from "@/lib/selections/query";

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

  const visibleSectionIds = await getClientVisibleSectionIds([project.id]);
  const visibleSectionFilter = idInFilter(visibleSectionIds);

  const [full, projects, scheduleItems, milestones, openTasks] =
    await Promise.all([
      prisma.project.findFirst({
        where: { id: project.id },
        include: {
          buyer: true,
          pm: true,
          milestones: { orderBy: { sortOrder: "asc" }, take: 8 },
          scheduleItems: { select: { status: true } },
          tasks: { select: { status: true } },
          documents: {
            where: { visibility: DocumentVisibility.CLIENT_VISIBLE },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          photos: {
            where: { visibility: PhotoVisibility.CLIENT_VISIBLE },
            orderBy: { createdAt: "desc" },
            take: 24,
          },
          changeOrders: {
            where: { status: ChangeOrderStatus.PENDING_CLIENT },
            take: 8,
          },
          selectionPackages: {
            where: {
              ...CLIENT_SELECTION_PACKAGE_STATUS_WHERE,
              sections: { some: visibleSectionFilter },
            },
            include: {
              sections: {
                where: {
                  ...visibleSectionFilter,
                  status: {
                    in: ["DRAFT", "CHANGES_REQUESTED", "SUBMITTED"],
                  },
                },
                take: 5,
              },
            },
            take: 3,
          },
          invoices: {
            where: { status: { notIn: ["PAID", "VOID", "DRAFT"] } },
            orderBy: { dueDate: "asc" },
            take: 5,
          },
        },
      }),
      prisma.project.findMany({
        where: { id: { in: ids } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          progressPercent: true,
          status: true,
          milestones: { select: { status: true } },
          scheduleItems: { select: { status: true } },
          tasks: { select: { status: true } },
        },
      }),
      prisma.scheduleItem.findMany({
        where: { projectId: project.id },
        orderBy: { startDate: "asc" },
      }),
      prisma.milestone.findMany({
        where: { projectId: project.id },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.task.findMany({
        where: {
          projectId: project.id,
          status: {
            in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
          },
        },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: 30,
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          status: true,
          startDate: true,
          createdAt: true,
        },
      }),
    ]);

  if (!full) {
    return (
      <EmptyState
        title="No project assigned"
        description="Your home build will appear here once your account is linked."
      />
    );
  }

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));

  const liveProgress = computeProjectProgress({
    progressPercent: full.progressPercent,
    status: full.status,
    milestones: full.milestones,
    scheduleItems: full.scheduleItems,
    tasks: full.tasks,
  });

  const wa = whatsappLink(
    full.pm?.phone,
    `Hi ${full.pm?.name ?? "PM"}, regarding ${full.name}`
  );

  const openSelections = full.selectionPackages.flatMap((p) => p.sections);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const todos: TodoItem[] = [
    ...full.changeOrders.map((co) => ({
      id: `co-${co.id}`,
      title: co.title,
      description: "Change order awaiting your action",
      dueDate: today,
      priority: Priority.HIGH,
      projectName: full.name,
      href: `/client/change-orders?projectId=${full.id}`,
    })),
    ...openSelections.map((sec) => ({
      id: `sel-${sec.id}`,
      title: sec.name,
      description: "Selection needs review",
      dueDate: today,
      priority: Priority.HIGH,
      projectName: full.name,
      href: "/client/selections",
    })),
    ...full.invoices.map((inv) => ({
      id: `inv-${inv.id}`,
      title: `Invoice ${inv.invoiceNumber}`,
      description: inv.dueDate ? `Due ${formatDate(inv.dueDate)}` : "Payment due",
      dueDate: inv.dueDate ?? today,
      priority: Priority.MEDIUM,
      projectName: full.name,
      href: "/client/payments",
    })),
    ...milestones
      .filter((m) => m.status !== "COMPLETED" && m.dueDate)
      .slice(0, 8)
      .map((m) => ({
        id: `ms-${m.id}`,
        title: m.title,
        description: "Upcoming milestone",
        dueDate: m.dueDate,
        priority: Priority.MEDIUM,
        projectName: full.name,
        href: `/client/schedule?projectId=${full.id}`,
      })),
  ];

  const localEvents: CalendarEvent[] = [
    ...scheduleItems.map((s) => ({
      id: `sched-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule" as const,
      meta: s.trade || full.name,
    })),
    ...milestones
      .filter((m) => m.dueDate)
      .map((m) => ({
        id: `ms-${m.id}`,
        date: m.dueDate!.toISOString(),
        title: m.title,
        type: "milestone" as const,
        meta: full.name,
      })),
    ...openTasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: `task-${t.id}`,
        date: t.dueDate!.toISOString(),
        title: t.title,
        type: "task" as const,
        meta: full.name,
      })),
  ];

  const [merged, connection] = await Promise.all([
    mergeExternalGoogleEvents({ session, localEvents }),
    getPublicConnection(session.user.id, session.membership.companyId),
  ]);

  const ganttTasks = buildGanttTree(
    scheduleItems.map((item) => ({
      id: item.id,
      title: item.title,
      trade: item.trade,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      dependsOnId: item.dependsOnId,
      assigneeName: item.assigneeName,
      projectName: full.name,
      href: `/client/schedule?projectId=${full.id}`,
    }))
  ).map((t) => ({
    ...t,
    href:
      t.isPhase || t.status === "PHASE"
        ? null
        : `/client/schedule?projectId=${full.id}`,
  }));

  const projectPicker = projects.map((p) => ({ id: p.id, name: p.name }));
  const heroImageSrc = full.heroImageUrl || null;

  return (
    <div className="w-full space-y-5">
      <ClientHomeHero
        projectName={full.name}
        statusLabel={full.status.replace(/_/g, " ")}
        imageSrc={heroImageSrc}
        progressPercent={liveProgress}
        photosHref={`/client/photos?projectId=${full.id}`}
      />

      <ClientPortalBanner
        projectName={full.name}
        statusLabel={full.status.replace(/_/g, " ")}
        projects={projectPicker}
        activeProjectId={full.id}
      />

      <ProjectPhotoGallery
        title="Project Photos"
        photos={full.photos.map((ph) => ({
          id: ph.id,
          src: ph.filePath,
          alt: ph.caption || "Project photo",
          caption: ph.caption,
          createdAt: ph.createdAt,
        }))}
        viewAllHref={`/client/photos?projectId=${full.id}`}
      />

      <DashboardWidgetRow>
        <RecentJobsCard
          jobs={projects.map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent:
              progressById.get(p.id) ??
              computeProjectProgress({
                progressPercent: p.progressPercent,
                status: p.status,
                milestones: p.milestones,
                scheduleItems: p.scheduleItems,
                tasks: p.tasks,
              }),
            href: `/client?projectId=${p.id}`,
          }))}
          selectedProjectId={full.id}
          linkMode="href"
          viewAllHref="/client"
          title="Your Homes"
          subtitle="Track build progress"
        />
        <TodoWidget
          items={todos}
          viewAllHref={`/client/schedule?projectId=${full.id}`}
        />
        <DashboardCalendarSlot>
          <CalendarWidget
            events={merged.events}
            subtitle="Your project schedule"
            googleConnected={connection.connected}
            googleReconnectRequired={
              connection.status === "RECONNECT_REQUIRED" ||
              merged.googleReconnectRequired
            }
            connectReturnPath="/client"
          />
        </DashboardCalendarSlot>
      </DashboardWidgetRow>

      <GanttChart
        className="w-full"
        tasks={ganttTasks}
        progressPercent={liveProgress}
        projectLabel={full.name}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
                    href={mediaUrl(doc.filePath) ?? "#"}
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
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Build progress</p>
              <span className="text-xs text-sb-muted">
                Buyer:{" "}
                {full.buyer
                  ? fullName(full.buyer.firstName, full.buyer.lastName)
                  : "—"}
              </span>
            </div>
            <ProgressBar value={liveProgress} color="orange" />
          </div>
        </Card>
      </div>
    </div>
  );
}
