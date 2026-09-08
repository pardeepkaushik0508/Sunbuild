import { DocumentVisibility, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiSession, getAccessibleProjectIds } from "@/lib/session";
import { resolveOwnerCompanies } from "@/lib/dashboard/company-stats";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const projectIds = await getAccessibleProjectIds(session);
    const role = session.membership.role;
    const isOwner = role === Role.OWNER;
    const isSales = role === Role.SALES_MANAGER;
    const isClient = role === Role.CLIENT;
    const isSub = role === Role.SUBCONTRACTOR;
    const companyIds = isOwner
      ? resolveOwnerCompanies(session).map((c) => c.id)
      : [session.membership.companyId];

    // Clients/subs must not discover internal-only document titles via search.
    const documentVisibilityFilter =
      isClient || isSub
        ? { visibility: DocumentVisibility.CLIENT_VISIBLE }
        : {};

    // Sales managers only search their assigned (or unassigned) leads.
    const leadAssigneeFilter =
      isSales && !isOwner
        ? {
            OR: [
              { assigneeId: session.user.id },
              { assigneeId: null },
            ],
          }
        : {};

    const [projects, tasks, users, documents, clients, leads, proposals] =
      await Promise.all([
        prisma.project.findMany({
          where: {
            id: { in: projectIds },
            OR: [
              { name: { contains: q } },
              { municipalAddress: { contains: q } },
            ],
          },
          select: { id: true, name: true, municipalAddress: true },
          take: 8,
        }),
        prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            title: { contains: q },
            ...(isSub ? { assigneeId: session.user.id } : {}),
          },
          select: {
            id: true,
            title: true,
            project: { select: { id: true, name: true } },
          },
          take: 8,
        }),
        // Hide internal staff directory from clients/subs.
        isClient || isSub
          ? Promise.resolve([])
          : prisma.membership.findMany({
              where: {
                companyId: { in: companyIds },
                isActive: true,
                user: { name: { contains: q } },
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
              take: 8,
            }),
        prisma.document.findMany({
          where: {
            projectId: { in: projectIds },
            title: { contains: q },
            ...documentVisibilityFilter,
          },
          select: {
            id: true,
            title: true,
            projectId: true,
            project: { select: { name: true } },
          },
          take: 6,
        }),
        isClient || isSub
          ? Promise.resolve([])
          : prisma.buyer.findMany({
              where: {
                projects: { some: { id: { in: projectIds } } },
                OR: [
                  { firstName: { contains: q } },
                  { lastName: { contains: q } },
                  { email: { contains: q } },
                ],
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
              take: 6,
            }),
        isOwner || isSales
          ? prisma.lead.findMany({
              where: {
                companyId: { in: companyIds },
                ...leadAssigneeFilter,
                OR: [
                  { firstName: { contains: q } },
                  { lastName: { contains: q } },
                  { email: { contains: q } },
                  { phone: { contains: q } },
                  { source: { contains: q } },
                ],
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
              take: 8,
            })
          : Promise.resolve([]),
        isOwner || isSales
          ? prisma.proposal.findMany({
              where: {
                companyId: { in: companyIds },
                ...(isSales && !isOwner
                  ? {
                      lead: {
                        OR: [
                          { assigneeId: session.user.id },
                          { assigneeId: null },
                        ],
                      },
                    }
                  : {}),
                OR: [{ title: { contains: q } }, { notes: { contains: q } }],
              },
              select: {
                id: true,
                title: true,
                status: true,
                leadId: true,
                lead: { select: { firstName: true, lastName: true } },
              },
              take: 6,
            })
          : Promise.resolve([]),
      ]);

    const projectHref = isClient
      ? "/client"
      : isSub
        ? "/sub"
        : isSales
          ? "/sales/leads"
          : `/pm/projects`;

    const results = [
      ...leads.map((l) => ({
        id: l.id,
        type: "lead" as const,
        title: `${l.firstName} ${l.lastName}`.trim(),
        subtitle: l.email ?? l.status,
        href: `/sales/leads/${l.id}`,
      })),
      ...proposals.map((p) => ({
        id: p.id,
        type: "proposal" as const,
        title: p.title,
        subtitle: `${p.lead.firstName} ${p.lead.lastName} · ${p.status}`,
        href: `/sales/leads/${p.leadId}`,
      })),
      ...projects.map((p) => ({
        id: p.id,
        type: "project" as const,
        title: p.name,
        subtitle: p.municipalAddress ?? undefined,
        href: isSub
          ? `/sub/jobs/${p.id}`
          : isClient
            ? "/client"
            : `/pm/projects/${p.id}`,
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: "task" as const,
        title: t.title,
        subtitle: t.project.name,
        href: isSub
          ? `/sub/jobs/${t.project.id}`
          : `/pm/tasks?projectId=${t.project.id}`,
      })),
      ...users.map((m) => ({
        id: m.user.id,
        type: "user" as const,
        title: m.user.name,
        subtitle: m.user.email,
        href: isOwner
          ? "/owner/users"
          : isSales
            ? "/sales/leads"
            : "/pm/projects",
      })),
      ...documents.map((d) => ({
        id: d.id,
        type: "document" as const,
        title: d.title,
        subtitle: d.project.name,
        href: isClient
          ? "/client/documents"
          : `/pm/documents?projectId=${d.projectId}`,
      })),
      ...clients.map((c) => ({
        id: c.id,
        type: "client" as const,
        title: `${c.firstName} ${c.lastName}`.trim(),
        subtitle: c.email ?? undefined,
        href: projectHref,
      })),
    ];

    return NextResponse.json({ results: results.slice(0, 24) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
