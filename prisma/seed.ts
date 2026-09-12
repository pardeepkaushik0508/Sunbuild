import { hashPassword } from "better-auth/crypto";
import {
  PrismaClient,
  Role,
  LeadStatus,
  ProjectStatus,
  TaskStatus,
  Priority,
  SelectionPackageStatus,
  SelectionSectionStatus,
  ChangeOrderStatus,
  PhotoVisibility,
  InvoiceStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const SELECTION_SECTIONS = [
  "Property Address / Interior Selections",
  "Tile & Grout – Flooring",
  "Tile & Grout – Walls",
  "Tile & Grout – Backsplash",
  "Carpet",
  "Laminate / Luxury Vinyl / Hardwood",
  "Fireplace",
  "Main Kitchen – Cabinetry",
  "Spice Kitchen – Cabinetry",
  "Primary Master Bathroom – Cabinetry",
  "Bathrooms & Laundry – Cabinetry",
  "Basement – Cabinetry",
  "Countertops",
  "Window Covering",
  "Finishing Material",
  "Paint",
  "Feature Wall",
  "Lighting Selections",
  "Plumbing Fixtures",
  "Built-in Closet Rendering",
  "Ceiling Texture",
  "Additional",
  "Notes / Considerations",
];

async function upsertUser(input: {
  email: string;
  name: string;
  phone?: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordHash = await hashPassword(input.password);

  if (existing) {
    await prisma.account.deleteMany({
      where: { userId: existing.id, providerId: "credential" },
    });
    await prisma.account.create({
      data: {
        userId: existing.id,
        accountId: existing.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    return prisma.user.update({
      where: { id: existing.id },
      data: { name: input.name, phone: input.phone, isActive: true, emailVerified: true },
    });
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      emailVerified: true,
      isActive: true,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    },
  });

  return user;
}

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: "sunview-homes" },
    update: {
      name: "Sunview Custom Homes",
      brand: "Sunview",
      description: "Luxury custom home construction",
      isActive: true,
    },
    create: {
      name: "Sunview Custom Homes",
      slug: "sunview-homes",
      brand: "Sunview",
      description: "Luxury custom home construction",
    },
  });

  const aspen = await prisma.company.upsert({
    where: { slug: "aspen-living" },
    update: {
      name: "Aspen Living",
      brand: "Aspen",
      description: "Sustainable residential communities",
      isActive: true,
    },
    create: {
      name: "Aspen Living",
      slug: "aspen-living",
      brand: "Aspen",
      description: "Sustainable residential communities",
    },
  });

  const brilliance = await prisma.company.upsert({
    where: { slug: "brilliance-homes" },
    update: {
      name: "Brilliance Homes",
      brand: "Brilliance",
      description: "High-end residential design",
      isActive: true,
    },
    create: {
      name: "Brilliance Homes",
      slug: "brilliance-homes",
      brand: "Brilliance",
      description: "High-end residential design",
    },
  });

  const password = "Password123!";

  const owner = await upsertUser({
    email: "owner@sunview.homes",
    name: "Alex Owner",
    phone: "14035550101",
    password,
  });
  const ceo = await upsertUser({
    email: "ceo@sunview.homes",
    name: "Casey CEO",
    phone: "14035550102",
    password,
  });
  const admin = await upsertUser({
    email: "admin@sunview.homes",
    name: "Ops Admin",
    phone: "14035550103",
    password,
  });
  const sales = await upsertUser({
    email: "sales@sunview.homes",
    name: "Sam Sales",
    phone: "14035550104",
    password,
  });
  const pm = await upsertUser({
    email: "pm@sunview.homes",
    name: "Sarah Johnson",
    phone: "14035550105",
    password,
  });
  const bookkeeper = await upsertUser({
    email: "books@sunview.homes",
    name: "Bailey Books",
    phone: "14035550106",
    password,
  });
  const sub = await upsertUser({
    email: "sub@sunview.homes",
    name: "Terry Trade",
    phone: "14035550107",
    password,
  });
  const client = await upsertUser({
    email: "client@example.com",
    name: "Jordan Homeowner",
    phone: "14035550999",
    password,
  });

  const memberships: Array<{
    userId: string;
    role: Role;
    canEditSettings?: boolean;
    financeAccess?: boolean;
  }> = [
    { userId: owner.id, role: Role.OWNER, canEditSettings: true, financeAccess: true },
    { userId: ceo.id, role: Role.CEO },
    { userId: admin.id, role: Role.OPERATIONS_ADMIN, canEditSettings: true },
    { userId: sales.id, role: Role.SALES_MANAGER },
    { userId: pm.id, role: Role.PROJECT_MANAGER },
    { userId: bookkeeper.id, role: Role.BOOKKEEPER, financeAccess: true },
    { userId: sub.id, role: Role.SUBCONTRACTOR },
    { userId: client.id, role: Role.CLIENT },
  ];

  for (const m of memberships) {
    await prisma.membership.upsert({
      where: {
        userId_companyId: {
          userId: m.userId,
          companyId: company.id,
        },
      },
      update: {
        role: m.role,
        isActive: true,
        canEditSettings: m.canEditSettings ?? false,
        financeAccess: m.financeAccess ?? false,
      },
      create: {
        userId: m.userId,
        companyId: company.id,
        role: m.role,
        canEditSettings: m.canEditSettings ?? false,
        financeAccess: m.financeAccess ?? false,
      },
    });
  }

  // Owner oversees all organization companies — memberships ordered so
  // primary Sunview membership remains session.memberships[0].
  for (const extraCompany of [aspen, brilliance]) {
    await prisma.membership.upsert({
      where: {
        userId_companyId: {
          userId: owner.id,
          companyId: extraCompany.id,
        },
      },
      update: {
        role: Role.OWNER,
        isActive: true,
        canEditSettings: true,
        financeAccess: true,
      },
      create: {
        userId: owner.id,
        companyId: extraCompany.id,
        role: Role.OWNER,
        canEditSettings: true,
        financeAccess: true,
      },
    });
  }

  const buyer = await prisma.buyer.create({
    data: {
      firstName: "Jordan",
      lastName: "Homeowner",
      email: "client@example.com",
      phone: "14035550999",
      mailingAddress: "12 Maple Ave, Calgary, AB",
      userId: client.id,
    },
  });

  const project = await prisma.project.create({
    data: {
      companyId: company.id,
      name: "Lot 42 – Aspen Ridge",
      lotInfo: "Lot 42 Block 3 Plan 2410234",
      municipalAddress: "1842 Aspen Ridge Dr SW, Calgary",
      legalAddress: "Lot 42 Block 3 Plan 2410234",
      status: ProjectStatus.IN_PROGRESS,
      progressPercent: 42,
      buyerId: buyer.id,
      pmId: pm.id,
      purchasePrice: 1250000,
      contractDate: new Date("2025-11-01"),
      targetClosing: new Date("2026-09-15"),
    },
  });

  await prisma.projectAccess.createMany({
    data: [
      { projectId: project.id, userId: pm.id, role: Role.PROJECT_MANAGER },
      { projectId: project.id, userId: sub.id, role: Role.SUBCONTRACTOR },
      { projectId: project.id, userId: client.id, role: Role.CLIENT },
      { projectId: project.id, userId: sales.id, role: Role.SALES_MANAGER },
    ],
  });

  await prisma.lead.create({
    data: {
      companyId: company.id,
      firstName: "Riley",
      lastName: "Prospect",
      email: "riley@example.com",
      phone: "14035550888",
      address: "West Calgary",
      status: LeadStatus.CONTACTED,
      notes: "Interested in custom bungalow.",
      estimatedValue: 875000,
      source: "Website",
      nextAction: "Schedule showhome visit",
      followUpAt: new Date(new Date().setHours(10, 30, 0, 0)),
      lastContactAt: new Date(),
      flaggedForFollowUp: true,
      assigneeId: sales.id,
      createdById: sales.id,
      activities: {
        create: [
          {
            userId: sales.id,
            type: "CALL",
            title: "Follow-up call with Riley Prospect",
            content: "Called — scheduling showhome visit.",
            activityDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
            dueAt: new Date(new Date().setHours(10, 30, 0, 0)),
            priority: Priority.HIGH,
          },
          {
            userId: sales.id,
            type: "NOTE",
            title: "Initial consultation notes",
            content: "Interested in custom bungalow, West Calgary lot.",
            activityDate: new Date(Date.now() - 26 * 60 * 60 * 1000),
          },
        ],
      },
      proposals: {
        create: {
          companyId: company.id,
          title: "Custom bungalow proposal",
          amount: 875000,
          status: "SENT",
          sentAt: new Date(),
          createdById: sales.id,
        },
      },
    },
  });

  await prisma.lead.create({
    data: {
      companyId: company.id,
      firstName: "Jordan",
      lastName: "Nguyen",
      email: "jordan.nguyen@example.com",
      phone: "14035550777",
      address: "Aspen Woods",
      status: LeadStatus.QUALIFIED,
      estimatedValue: 1200000,
      source: "Referral",
      nextAction: "Send proposal draft",
      followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      assigneeId: sales.id,
      createdById: sales.id,
      activities: {
        create: {
          userId: sales.id,
          type: "MEETING",
          title: "Qualification meeting",
          content: "Discussed budget and timeline for Aspen Woods lot.",
          activityDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
          dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          priority: Priority.MEDIUM,
        },
      },
    },
  });

  await prisma.task.createMany({
    data: [
      {
        projectId: project.id,
        title: "Foundation Inspection",
        description: "Scheduled inspection for Sunview project site A",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueDate: new Date(),
        assigneeId: pm.id,
        createdById: pm.id,
      },
      {
        projectId: project.id,
        title: "Material Delivery",
        description: "Lumber shipment arrival for Aspen Living project",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date(new Date().setHours(9, 15, 0, 0)),
        assigneeId: sub.id,
        createdById: pm.id,
      },
      {
        projectId: project.id,
        title: "Rough-in plumbing review",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date(Date.now() + 3 * 86400000),
        assigneeId: sub.id,
        createdById: pm.id,
      },
    ],
  });

  await prisma.milestone.createMany({
    data: [
      { projectId: project.id, title: "Foundation", status: "COMPLETED", sortOrder: 1, dueDate: new Date("2026-01-15") },
      { projectId: project.id, title: "Framing", status: "IN_PROGRESS", sortOrder: 2, dueDate: new Date("2026-03-01") },
      { projectId: project.id, title: "Drywall", status: "PLANNED", sortOrder: 3, dueDate: new Date("2026-05-01") },
      { projectId: project.id, title: "Closing", status: "PLANNED", sortOrder: 4, dueDate: new Date("2026-09-15") },
    ],
  });

  const framing = await prisma.scheduleItem.create({
    data: {
      projectId: project.id,
      title: "Framing",
      trade: "Framing",
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-03-01"),
      status: "IN_PROGRESS",
      assigneeName: "Mike Chen",
    },
  });
  const electrical = await prisma.scheduleItem.create({
    data: {
      projectId: project.id,
      title: "Electrical rough-in",
      trade: "Electrical",
      startDate: new Date("2026-03-05"),
      endDate: new Date("2026-03-20"),
      status: "PLANNED",
      assigneeName: "Emma Wilson",
      dependsOnId: framing.id,
    },
  });
  await prisma.scheduleItem.createMany({
    data: [
      {
        projectId: project.id,
        title: "Requirements Gathering",
        trade: "Planning",
        startDate: new Date("2026-01-10"),
        endDate: new Date("2026-01-25"),
        status: "COMPLETED",
        assigneeName: "Mike Chen",
      },
      {
        projectId: project.id,
        title: "User Research",
        trade: "Planning",
        startDate: new Date("2026-01-20"),
        endDate: new Date("2026-02-05"),
        status: "IN_PROGRESS",
        assigneeName: "Emma Wilson",
      },
      {
        projectId: project.id,
        title: "Competitive Analysis",
        trade: "Planning",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-12"),
        status: "DELAYED",
        assigneeName: "David Park",
      },
      {
        projectId: project.id,
        title: "Wireframing",
        trade: "Design",
        startDate: new Date("2026-02-15"),
        endDate: new Date("2026-03-05"),
        status: "PLANNED",
        assigneeName: "Alex Turner",
        dependsOnId: electrical.id,
      },
      {
        projectId: project.id,
        title: "Visual Design",
        trade: "Design",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-25"),
        status: "PLANNED",
        assigneeName: "Sophie Kim",
      },
      {
        projectId: project.id,
        title: "Plumbing rough-in",
        trade: "Plumbing",
        startDate: new Date("2026-03-08"),
        endDate: new Date("2026-03-22"),
        status: "PLANNED",
        assigneeName: "Terry Trade",
        dependsOnId: framing.id,
      },
    ],
  });

  const pkg = await prisma.selectionPackage.create({
    data: {
      projectId: project.id,
      title: "Home Selections",
      status: SelectionPackageStatus.OPEN,
      sections: {
        create: SELECTION_SECTIONS.map((name, i) => ({
          name,
          sortOrder: i + 1,
          status: SelectionSectionStatus.DRAFT,
          allowance: name.includes("Kitchen") ? 15000 : 2000,
          items: {
            create: [
              {
                label: "Primary selection",
                optionValue: "",
                notes: "",
                allowanceAmount: name.includes("Kitchen") ? 15000 : 2000,
                sortOrder: 1,
              },
            ],
          },
        })),
      },
    },
  });

  await prisma.changeOrder.create({
    data: {
      projectId: project.id,
      title: "Upgrade quartz island",
      description: "Client requested premium quartz",
      amount: 3200,
      reason: "Selection overage",
      status: ChangeOrderStatus.PENDING_CLIENT,
      createdById: pm.id,
    },
  });

  await prisma.rFI.create({
    data: {
      projectId: project.id,
      title: "Beam size clarification",
      question: "Confirm LVL size at great room opening.",
      status: "OPEN",
      priority: Priority.HIGH,
      dueDate: new Date(Date.now() + 2 * 86400000),
      assigneeId: sub.id,
      createdById: pm.id,
    },
  });

  await prisma.dailyLog.create({
    data: {
      projectId: project.id,
      authorId: sub.id,
      logDate: new Date(),
      workCompleted: "Framing progressed on second floor.",
      siteNotes: "Material delivery on schedule.",
      status: "SUBMITTED",
    },
  });

  await prisma.photo.create({
    data: {
      projectId: project.id,
      filePath: "seed/placeholder.txt",
      fileName: "site-progress.txt",
      caption: "Framing progress (internal)",
      visibility: PhotoVisibility.INTERNAL,
      uploadedById: sub.id,
    },
  });

  await prisma.invoice.create({
    data: {
      projectId: project.id,
      invoiceNumber: "INV-1001",
      amount: 25000,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      status: InvoiceStatus.SENT,
      notes: "Progress draw #2",
      uploadedById: bookkeeper.id,
    },
  });

  await prisma.deposit.createMany({
    data: [
      { projectId: project.id, label: "Deposit 1", amount: 25000, status: "RECEIVED", dueDate: new Date("2025-11-05") },
      { projectId: project.id, label: "Deposit 2", amount: 50000, status: "PENDING", dueDate: new Date("2026-04-01") },
    ],
  });

  await prisma.condition.create({
    data: {
      projectId: project.id,
      title: "Mortgage approval",
      status: "SATISFIED",
      dueDate: new Date("2025-12-01"),
    },
  });

  // Sample projects for sister companies (Owner Overview multi-company cards)
  await prisma.project.create({
    data: {
      companyId: aspen.id,
      name: "Aspen Grove Townhomes – Phase 2",
      municipalAddress: "220 Aspen Grove Blvd, Calgary",
      status: ProjectStatus.IN_PROGRESS,
      progressPercent: 28,
      purchasePrice: 980000,
      targetClosing: new Date(Date.now() + 45 * 86400000),
    },
  });
  await prisma.project.create({
    data: {
      companyId: aspen.id,
      name: "Aspen Living Showhome",
      municipalAddress: "18 Aspen Way, Calgary",
      status: ProjectStatus.COMPLETED,
      progressPercent: 100,
      purchasePrice: 740000,
    },
  });
  await prisma.project.create({
    data: {
      companyId: brilliance.id,
      name: "Brilliance Estate Residence",
      municipalAddress: "9 Brilliance Crescent NW, Calgary",
      status: ProjectStatus.PRE_CONSTRUCTION,
      progressPercent: 8,
      purchasePrice: 2100000,
      targetClosing: new Date(Date.now() + 120 * 86400000),
    },
  });
  await prisma.project.create({
    data: {
      companyId: brilliance.id,
      name: "Brilliance Modern Bungalow",
      status: ProjectStatus.HANDED_OVER,
      progressPercent: 100,
      purchasePrice: 1650000,
    },
  });

  console.log("Seed complete.");
  console.log("Login password for all demo users:", password);
  console.log("Examples: owner@sunview.homes / pm@sunview.homes / client@example.com");
  console.log("Selection package:", pkg.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
