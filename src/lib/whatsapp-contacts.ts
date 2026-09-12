import { prisma } from "@/lib/db";
import type { WhatsAppContact } from "@/components/whatsapp/whatsapp-sidebar";

export async function getWhatsAppContacts(input: {
  companyId: string;
  userId: string;
  accessibleProjectIds: string[];
}): Promise<WhatsAppContact[]> {
  const { companyId, accessibleProjectIds } = input;
  const projectIds = accessibleProjectIds.slice(0, 20);

  const [memberships, projects] = await Promise.all([
    prisma.membership.findMany({
      where: {
        companyId,
        isActive: true,
        user: { phone: { not: null } },
      },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, phone: true } },
      },
      take: 40,
    }),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            name: true,
            buyer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            pm: { select: { id: true, name: true, phone: true } },
            access: {
              take: 8,
              select: {
                id: true,
                role: true,
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const contacts: WhatsAppContact[] = [];
  const seen = new Set<string>();

  function push(contact: WhatsAppContact) {
    const key = contact.phone || contact.id;
    if (seen.has(key)) return;
    if (!contact.phone && contact.kind !== "group") return;
    seen.add(key);
    contacts.push(contact);
  }

  for (const project of projects) {
    push({
      id: `group-${project.id}`,
      name: `${project.name} Team`,
      role: "Group Chat",
      projectId: project.id,
      projectName: project.name,
      phone: project.pm?.phone || project.buyer?.phone || null,
      preview: "Project coordination thread",
      unread: 0,
      kind: "group",
    });

    if (project.buyer) {
      push({
        id: `buyer-${project.buyer.id}`,
        name: `${project.buyer.firstName} ${project.buyer.lastName}`,
        role: "Client / Homeowner",
        phone: project.buyer.phone,
        projectId: project.id,
        projectName: project.name,
        preview: "Client project updates",
        unread: 0,
        kind: "client",
      });
    }

    if (project.pm) {
      push({
        id: `pm-${project.pm.id}`,
        name: project.pm.name,
        role: "Project Manager",
        phone: project.pm.phone,
        projectId: project.id,
        projectName: project.name,
        preview: "Site and schedule coordination",
        unread: 0,
        kind: "pm",
      });
    }

    for (const access of project.access) {
      const role = access.role || "TEAM";
      push({
        id: `access-${access.id}`,
        name: access.user.name,
        role: role.replace(/_/g, " "),
        phone: access.user.phone,
        projectId: project.id,
        projectName: project.name,
        preview: "Assigned project contact",
        unread: 0,
        kind:
          role === "SUBCONTRACTOR"
            ? "sub"
            : role === "CLIENT"
              ? "client"
              : role === "SALES_MANAGER"
                ? "sales"
                : "team",
      });
    }
  }

  for (const m of memberships) {
    if (!m.user.phone) continue;
    push({
      id: `member-${m.id}`,
      name: m.user.name,
      role: m.role.replace(/_/g, " "),
      phone: m.user.phone,
      preview: "Company contact",
      unread: 0,
      kind:
        m.role === "SUBCONTRACTOR"
          ? "sub"
          : m.role === "CLIENT"
            ? "client"
            : m.role === "SALES_MANAGER"
              ? "sales"
              : m.role === "PROJECT_MANAGER"
                ? "pm"
                : "team",
    });
  }

  return contacts.slice(0, 40);
}
