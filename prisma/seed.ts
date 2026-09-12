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
  DocumentVisibility,
  InvoiceStatus,
} from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

/** Retry once on Render idle disconnects (P1017). */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code !== "P1017") throw err;
    console.warn(`[seed] reconnect after ${label}…`);
    await prisma.$disconnect();
    await prisma.$connect();
    return fn();
  }
}

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

const DEMO_PASSWORD = "Password123!";

async function upsertUser(input: {
  email: string;
  name: string;
  phone?: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
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
      data: {
        name: input.name,
        phone: input.phone,
        email,
        isActive: true,
        emailVerified: true,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      email,
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

async function upsertMembership(
  userId: string,
  companyId: string,
  role: Role,
  flags: { canEditSettings?: boolean; financeAccess?: boolean } = {}
) {
  await prisma.membership.upsert({
    where: { userId_companyId_role: { userId, companyId, role } },
    update: {
      isActive: true,
      canEditSettings: flags.canEditSettings ?? false,
      financeAccess: flags.financeAccess ?? false,
    },
    create: {
      userId,
      companyId,
      role,
      canEditSettings: flags.canEditSettings ?? false,
      financeAccess: flags.financeAccess ?? false,
    },
  });
}

type SeedProjectDef = {
  name: string;
  lotInfo: string;
  municipalAddress: string;
  status: ProjectStatus;
  progressPercent: number;
  purchasePrice: number;
  contractDate: Date;
  targetClosing: Date;
  buyerKey: "jordan" | "morgan" | "avery";
  invoiceAmount: number;
  changeOrderAmount: number;
  deposit1: number;
  deposit2: number;
};

const SUNVIEW_PROJECTS: SeedProjectDef[] = [
  {
    name: "Lot 42 – Aspen Ridge",
    lotInfo: "Lot 42 Block 3 Plan 2410234",
    municipalAddress: "1842 Aspen Ridge Dr SW, Calgary",
    status: ProjectStatus.IN_PROGRESS,
    progressPercent: 42,
    purchasePrice: 1250000,
    contractDate: new Date("2025-11-01"),
    targetClosing: new Date("2026-09-15"),
    buyerKey: "jordan",
    invoiceAmount: 25000,
    changeOrderAmount: 3200,
    deposit1: 25000,
    deposit2: 50000,
  },
  {
    name: "Lot 18 – Mahogany Lakes",
    lotInfo: "Lot 18 Block 1 Plan 2410890",
    municipalAddress: "2910 Mahogany Blvd SE, Calgary",
    status: ProjectStatus.IN_PROGRESS,
    progressPercent: 61,
    purchasePrice: 980000,
    contractDate: new Date("2025-09-12"),
    targetClosing: new Date("2026-07-30"),
    buyerKey: "morgan",
    invoiceAmount: 32000,
    changeOrderAmount: 1800,
    deposit1: 20000,
    deposit2: 40000,
  },
  {
    name: "Lot 7 – Evanston Heights",
    lotInfo: "Lot 7 Block 5 Plan 2510122",
    municipalAddress: "112 Evanston Way NW, Calgary",
    status: ProjectStatus.PRE_CONSTRUCTION,
    progressPercent: 12,
    purchasePrice: 875000,
    contractDate: new Date("2026-01-20"),
    targetClosing: new Date("2026-12-01"),
    buyerKey: "avery",
    invoiceAmount: 15000,
    changeOrderAmount: 950,
    deposit1: 15000,
    deposit2: 30000,
  },
  {
    name: "Lot 55 – Legacy Ridge",
    lotInfo: "Lot 55 Block 2 Plan 2410555",
    municipalAddress: "55 Legacy Hill Dr SE, Calgary",
    status: ProjectStatus.SUBSTANTIAL_COMPLETION,
    progressPercent: 88,
    purchasePrice: 1425000,
    contractDate: new Date("2025-06-01"),
    targetClosing: new Date("2026-05-15"),
    buyerKey: "jordan",
    invoiceAmount: 48000,
    changeOrderAmount: 5400,
    deposit1: 40000,
    deposit2: 60000,
  },
  {
    name: "Lot 3 – West Springs Estate",
    lotInfo: "Lot 3 Block 9 Plan 2310444",
    municipalAddress: "830 West Springs Rd SW, Calgary",
    status: ProjectStatus.IN_PROGRESS,
    progressPercent: 35,
    purchasePrice: 1680000,
    contractDate: new Date("2025-10-08"),
    targetClosing: new Date("2026-10-20"),
    buyerKey: "morgan",
    invoiceAmount: 41000,
    changeOrderAmount: 2750,
    deposit1: 35000,
    deposit2: 70000,
  },
];

async function seedProjectContent(opts: {
  projectId: string;
  companyId: string;
  def: SeedProjectDef;
  index: number;
  pmId: string;
  subId: string;
  bookkeeperId: string;
  salesId: string;
}) {
  const { projectId, companyId, def, index, pmId, subId, bookkeeperId, salesId } =
    opts;
  const n = index + 1;

  await prisma.task.createMany({
    data: [
      {
        projectId,
        title: `Site walkthrough – ${def.name}`,
        description: "Weekly PM site review and punch-list update.",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueDate: new Date(),
        assigneeId: pmId,
        createdById: pmId,
      },
      {
        projectId,
        title: `Material delivery – Phase ${n}`,
        description: "Confirm lumber / drywall delivery window.",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date(Date.now() + n * 86400000),
        assigneeId: subId,
        createdById: pmId,
      },
      {
        projectId,
        title: `Trade coordination call`,
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date(Date.now() + (n + 2) * 86400000),
        assigneeId: subId,
        createdById: pmId,
      },
    ],
  });

  await prisma.milestone.createMany({
    data: [
      {
        projectId,
        title: "Foundation",
        status: def.progressPercent >= 20 ? "COMPLETED" : "IN_PROGRESS",
        sortOrder: 1,
        dueDate: new Date("2026-01-15"),
      },
      {
        projectId,
        title: "Framing",
        status: def.progressPercent >= 40 ? "COMPLETED" : "IN_PROGRESS",
        sortOrder: 2,
        dueDate: new Date("2026-03-01"),
      },
      {
        projectId,
        title: "Drywall",
        status: def.progressPercent >= 70 ? "IN_PROGRESS" : "PLANNED",
        sortOrder: 3,
        dueDate: new Date("2026-05-01"),
      },
      {
        projectId,
        title: "Closing",
        status: "PLANNED",
        sortOrder: 4,
        dueDate: def.targetClosing,
      },
    ],
  });

  const framing = await prisma.scheduleItem.create({
    data: {
      projectId,
      title: "Framing",
      trade: "Framing",
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-03-01"),
      status: def.progressPercent >= 40 ? "COMPLETED" : "IN_PROGRESS",
      assigneeName: "Mike Chen",
    },
  });
  await prisma.scheduleItem.createMany({
    data: [
      {
        projectId,
        title: "Electrical rough-in",
        trade: "Electrical",
        startDate: new Date("2026-03-05"),
        endDate: new Date("2026-03-20"),
        status: "PLANNED",
        assigneeName: "Emma Wilson",
        dependsOnId: framing.id,
      },
      {
        projectId,
        title: "Plumbing rough-in",
        trade: "Plumbing",
        startDate: new Date("2026-03-08"),
        endDate: new Date("2026-03-22"),
        status: "PLANNED",
        assigneeName: "Terry Trade",
        dependsOnId: framing.id,
      },
      {
        projectId,
        title: "Interior finishes",
        trade: "Finishing",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-06-15"),
        status: "PLANNED",
        assigneeName: "Sophie Kim",
      },
    ],
  });

  const pkg = await withRetry(
    () =>
      prisma.selectionPackage.create({
        data: {
          projectId,
          title: "Home Selections",
          status: SelectionPackageStatus.OPEN,
        },
      }),
    `selectionPackage project ${n}`
  );

  for (let i = 0; i < SELECTION_SECTIONS.length; i++) {
    const name = SELECTION_SECTIONS[i];
    await withRetry(
      () =>
        prisma.selectionSection.create({
          data: {
            packageId: pkg.id,
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
          },
        }),
      `selectionSection ${i + 1} project ${n}`
    );
  }

  await prisma.changeOrder.create({
    data: {
      projectId,
      title: n % 2 === 0 ? "Upgrade quartz island" : "Add feature wall lighting",
      description: "Dummy change order for QA / client portal testing.",
      amount: def.changeOrderAmount,
      reason: "Selection overage",
      status:
        n % 2 === 0
          ? ChangeOrderStatus.PENDING_CLIENT
          : ChangeOrderStatus.APPROVED,
      createdById: pmId,
    },
  });

  await prisma.rFI.create({
    data: {
      projectId,
      title: `Clarification #${n}`,
      question: "Confirm beam size / opening dimensions before rough-in.",
      status: "OPEN",
      priority: Priority.HIGH,
      dueDate: new Date(Date.now() + (n + 1) * 86400000),
      assigneeId: subId,
      createdById: pmId,
    },
  });

  await prisma.dailyLog.create({
    data: {
      projectId,
      authorId: subId,
      logDate: new Date(Date.now() - n * 3600000),
      workCompleted: `Progress update for ${def.name}.`,
      siteNotes: "Weather clear. Delivery on schedule.",
      status: "SUBMITTED",
    },
  });

  await prisma.photo.createMany({
    data: [
      {
        projectId,
        filePath: "seed/placeholder.txt",
        fileName: `site-progress-${n}.txt`,
        caption: "Framing / site progress (internal)",
        visibility: PhotoVisibility.INTERNAL,
        uploadedById: subId,
      },
      {
        projectId,
        filePath: "seed/placeholder-client.txt",
        fileName: `client-update-${n}.txt`,
        caption: "Weekly photo update for client",
        visibility: PhotoVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
      },
    ],
  });

  await prisma.document.createMany({
    data: [
      {
        projectId,
        title: "Construction schedule",
        category: "SCHEDULE",
        filePath: "seed/schedule.txt",
        fileName: `schedule-${n}.txt`,
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
        notes: "Dummy client-visible schedule PDF placeholder",
      },
      {
        projectId,
        title: "Internal cost worksheet",
        category: "FINANCE",
        filePath: "seed/costs.txt",
        fileName: `costs-${n}.txt`,
        visibility: DocumentVisibility.INTERNAL,
        uploadedById: bookkeeperId,
      },
    ],
  });

  await prisma.invoice.create({
    data: {
      projectId,
      invoiceNumber: `INV-${1000 + n}`,
      amount: def.invoiceAmount,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      status: n === 1 ? InvoiceStatus.PAID : InvoiceStatus.SENT,
      notes: `Progress draw #${n}`,
      uploadedById: bookkeeperId,
    },
  });

  await prisma.deposit.createMany({
    data: [
      {
        projectId,
        label: "Deposit 1",
        amount: def.deposit1,
        status: "RECEIVED",
        dueDate: def.contractDate,
      },
      {
        projectId,
        label: "Deposit 2",
        amount: def.deposit2,
        status: "PENDING",
        dueDate: new Date(def.targetClosing.getTime() - 90 * 86400000),
      },
    ],
  });

  await prisma.condition.create({
    data: {
      projectId,
      title: "Mortgage approval",
      status: n <= 2 ? "SATISFIED" : "OPEN",
      dueDate: new Date("2025-12-01"),
    },
  });

  // Light sales touchpoint per project for salesperson testing
  if (n <= 3) {
    await prisma.lead.create({
      data: {
        companyId,
        firstName: ["Riley", "Casey", "Taylor"][n - 1],
        lastName: ["Prospect", "Buyer", "Lead"][n - 1],
        email: `lead${n}@example.com`,
        phone: `1403555088${n}`,
        address: def.municipalAddress,
        status:
          n === 1
            ? LeadStatus.CONTACTED
            : n === 2
              ? LeadStatus.QUALIFIED
              : LeadStatus.PROPOSAL,
        notes: `Pipeline lead tied to ${def.name} neighbourhood interest.`,
        estimatedValue: def.purchasePrice * 0.9,
        source: n === 2 ? "Referral" : "Website",
        nextAction: "Follow up this week",
        followUpAt: new Date(Date.now() + n * 86400000),
        lastContactAt: new Date(),
        flaggedForFollowUp: n === 1,
        assigneeId: salesId,
        createdById: salesId,
        activities: {
          create: [
            {
              userId: salesId,
              type: "CALL",
              title: `Call – lead ${n}`,
              content: "Dummy sales activity for testing.",
              activityDate: new Date(Date.now() - n * 3600000),
              dueAt: new Date(Date.now() + n * 86400000),
              priority: Priority.HIGH,
            },
          ],
        },
        proposals: {
          create: {
            companyId,
            title: `Proposal – ${def.name}`,
            amount: def.purchasePrice * 0.92,
            status: "SENT",
            sentAt: new Date(),
            createdById: salesId,
          },
        },
      },
    });
  }
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

  // MVP: keep Aspen / Brilliance rows for later rollout; hide via isActive +
  // MVP_HIDDEN_COMPANY_SLUGS in src/lib/companies/mvp-visibility.ts.
  const aspen = await prisma.company.upsert({
    where: { slug: "aspen-living" },
    update: {
      name: "Aspen Living",
      brand: "Aspen",
      description: "Sustainable residential communities",
      isActive: false,
    },
    create: {
      name: "Aspen Living",
      slug: "aspen-living",
      brand: "Aspen",
      description: "Sustainable residential communities",
      isActive: false,
    },
  });

  const brilliance = await prisma.company.upsert({
    where: { slug: "brilliance-homes" },
    update: {
      name: "Brilliance Homes",
      brand: "Brilliance",
      description: "High-end residential design",
      isActive: false,
    },
    create: {
      name: "Brilliance Homes",
      slug: "brilliance-homes",
      brand: "Brilliance",
      description: "High-end residential design",
      isActive: false,
    },
  });

  const owner = await upsertUser({
    email: "owner@sunview.homes",
    name: "Alex Owner",
    phone: "14035550101",
    password: DEMO_PASSWORD,
  });
  const ceo = await upsertUser({
    email: "ceo@sunview.homes",
    name: "Casey CEO",
    phone: "14035550102",
    password: DEMO_PASSWORD,
  });
  const admin = await upsertUser({
    email: "admin@sunview.homes",
    name: "Ops Admin",
    phone: "14035550103",
    password: DEMO_PASSWORD,
  });
  const sales = await upsertUser({
    email: "sales@sunview.homes",
    name: "Sam Sales",
    phone: "14035550104",
    password: DEMO_PASSWORD,
  });
  const pm = await upsertUser({
    email: "pm@sunview.homes",
    name: "Sarah Johnson",
    phone: "14035550105",
    password: DEMO_PASSWORD,
  });
  const bookkeeper = await upsertUser({
    email: "books@sunview.homes",
    name: "Bailey Books",
    phone: "14035550106",
    password: DEMO_PASSWORD,
  });
  const sub = await upsertUser({
    email: "sub@sunview.homes",
    name: "Terry Trade",
    phone: "14035550107",
    password: DEMO_PASSWORD,
  });
  const client = await upsertUser({
    email: "client@example.com",
    name: "Jordan Homeowner",
    phone: "14035550999",
    password: DEMO_PASSWORD,
  });
  const client2 = await upsertUser({
    email: "client2@example.com",
    name: "Morgan Buyer",
    phone: "14035550998",
    password: DEMO_PASSWORD,
  });
  const client3 = await upsertUser({
    email: "client3@example.com",
    name: "Avery Patron",
    phone: "14035550997",
    password: DEMO_PASSWORD,
  });
  const justin = await upsertUser({
    email: "justin.amaldas@gmail.com",
    name: "Justin Amaldas",
    phone: "14035550100",
    password: DEMO_PASSWORD,
  });

  await upsertMembership(owner.id, company.id, Role.OWNER, {
    canEditSettings: true,
    financeAccess: true,
  });
  await upsertMembership(ceo.id, company.id, Role.CEO);
  await upsertMembership(admin.id, company.id, Role.OPERATIONS_ADMIN, {
    canEditSettings: true,
  });
  await upsertMembership(sales.id, company.id, Role.SALES_MANAGER);
  await upsertMembership(pm.id, company.id, Role.PROJECT_MANAGER);
  await upsertMembership(bookkeeper.id, company.id, Role.BOOKKEEPER, {
    financeAccess: true,
  });
  await upsertMembership(sub.id, company.id, Role.SUBCONTRACTOR);
  await upsertMembership(client.id, company.id, Role.CLIENT);
  await upsertMembership(client2.id, company.id, Role.CLIENT);
  await upsertMembership(client3.id, company.id, Role.CLIENT);

  // Multi-profile demo user — every role on Sunview (switch via profile menu)
  const justinRoles: Array<{
    role: Role;
    flags?: { canEditSettings?: boolean; financeAccess?: boolean };
  }> = [
    { role: Role.OWNER, flags: { canEditSettings: true, financeAccess: true } },
    { role: Role.CEO },
    { role: Role.OPERATIONS_ADMIN, flags: { canEditSettings: true } },
    { role: Role.SALES_MANAGER },
    { role: Role.PROJECT_MANAGER },
    { role: Role.BOOKKEEPER, flags: { financeAccess: true } },
    { role: Role.SUBCONTRACTOR },
    { role: Role.CLIENT },
  ];
  for (const entry of justinRoles) {
    await upsertMembership(justin.id, company.id, entry.role, entry.flags);
  }

  // Owner oversees sister companies
  for (const extraCompany of [aspen, brilliance]) {
    await upsertMembership(owner.id, extraCompany.id, Role.OWNER, {
      canEditSettings: true,
      financeAccess: true,
    });
  }

  // Wipe prior demo project graph so seed is re-runnable without full DB reset
  const companyIds = [company.id, aspen.id, brilliance.id];
  await prisma.lead.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.project.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.buyer.deleteMany({
    where: {
      OR: [
        { userId: { in: [client.id, client2.id, client3.id] } },
        {
          email: {
            in: [
              "client@example.com",
              "client2@example.com",
              "client3@example.com",
            ],
          },
        },
      ],
    },
  });

  const buyers = {
    jordan: await prisma.buyer.create({
      data: {
        firstName: "Jordan",
        lastName: "Homeowner",
        email: "client@example.com",
        phone: "14035550999",
        mailingAddress: "12 Maple Ave, Calgary, AB",
        userId: client.id,
      },
    }),
    morgan: await prisma.buyer.create({
      data: {
        firstName: "Morgan",
        lastName: "Buyer",
        email: "client2@example.com",
        phone: "14035550998",
        mailingAddress: "88 Riverbend Rd, Calgary, AB",
        userId: client2.id,
      },
    }),
    avery: await prisma.buyer.create({
      data: {
        firstName: "Avery",
        lastName: "Patron",
        email: "client3@example.com",
        phone: "14035550997",
        mailingAddress: "401 Crowfoot Cres NW, Calgary, AB",
        userId: client3.id,
      },
    }),
  };

  const createdProjects: Array<{ id: string; buyerKey: SeedProjectDef["buyerKey"] }> =
    [];

  for (let i = 0; i < SUNVIEW_PROJECTS.length; i++) {
    const def = SUNVIEW_PROJECTS[i];
    const buyer = buyers[def.buyerKey];
    const project = await prisma.project.create({
      data: {
        companyId: company.id,
        name: def.name,
        lotInfo: def.lotInfo,
        municipalAddress: def.municipalAddress,
        legalAddress: def.lotInfo,
        status: def.status,
        progressPercent: def.progressPercent,
        buyerId: buyer.id,
        pmId: pm.id,
        purchasePrice: def.purchasePrice,
        contractDate: def.contractDate,
        targetClosing: def.targetClosing,
      },
    });
    createdProjects.push({ id: project.id, buyerKey: def.buyerKey });

    // Explicit access for scoped roles (PM also via pmId)
    await prisma.projectAccess.createMany({
      data: [
        { projectId: project.id, userId: pm.id, role: Role.PROJECT_MANAGER },
        { projectId: project.id, userId: sales.id, role: Role.SALES_MANAGER },
        { projectId: project.id, userId: sub.id, role: Role.SUBCONTRACTOR },
        { projectId: project.id, userId: client.id, role: Role.CLIENT },
        { projectId: project.id, userId: client2.id, role: Role.CLIENT },
        { projectId: project.id, userId: client3.id, role: Role.CLIENT },
        // Justin multi-profile: one access row unlocks Sales/PM/Sub/Client views
        { projectId: project.id, userId: justin.id, role: Role.PROJECT_MANAGER },
      ],
      skipDuplicates: true,
    });

    await seedProjectContent({
      projectId: project.id,
      companyId: company.id,
      def,
      index: i,
      pmId: pm.id,
      subId: sub.id,
      bookkeeperId: bookkeeper.id,
      salesId: sales.id,
    });
  }

  // Sister-company projects so Owner multi-company views stay populated
  await prisma.project.createMany({
    data: [
      {
        companyId: aspen.id,
        name: "Aspen Grove Townhomes – Phase 2",
        municipalAddress: "220 Aspen Grove Blvd, Calgary",
        status: ProjectStatus.IN_PROGRESS,
        progressPercent: 28,
        purchasePrice: 980000,
        targetClosing: new Date(Date.now() + 45 * 86400000),
        pmId: pm.id,
      },
      {
        companyId: aspen.id,
        name: "Aspen Living Showhome",
        municipalAddress: "18 Aspen Way, Calgary",
        status: ProjectStatus.COMPLETED,
        progressPercent: 100,
        purchasePrice: 740000,
      },
      {
        companyId: aspen.id,
        name: "Aspen Creek Duplex Pair",
        municipalAddress: "44 Aspen Creek Lane, Calgary",
        status: ProjectStatus.IN_PROGRESS,
        progressPercent: 51,
        purchasePrice: 860000,
        targetClosing: new Date(Date.now() + 70 * 86400000),
      },
      {
        companyId: aspen.id,
        name: "Aspen Ridge Spec Home",
        municipalAddress: "901 Aspen Ridge Ct, Calgary",
        status: ProjectStatus.PRE_CONSTRUCTION,
        progressPercent: 5,
        purchasePrice: 720000,
      },
      {
        companyId: aspen.id,
        name: "Aspen Meadows Estate",
        municipalAddress: "15 Meadows Gate, Calgary",
        status: ProjectStatus.ON_HOLD,
        progressPercent: 22,
        purchasePrice: 1100000,
      },
      {
        companyId: brilliance.id,
        name: "Brilliance Estate Residence",
        municipalAddress: "9 Brilliance Crescent NW, Calgary",
        status: ProjectStatus.PRE_CONSTRUCTION,
        progressPercent: 8,
        purchasePrice: 2100000,
        targetClosing: new Date(Date.now() + 120 * 86400000),
      },
      {
        companyId: brilliance.id,
        name: "Brilliance Modern Bungalow",
        status: ProjectStatus.HANDED_OVER,
        progressPercent: 100,
        purchasePrice: 1650000,
      },
      {
        companyId: brilliance.id,
        name: "Brilliance Courtyard Villa",
        municipalAddress: "77 Courtyard Lane NW, Calgary",
        status: ProjectStatus.IN_PROGRESS,
        progressPercent: 44,
        purchasePrice: 1890000,
        targetClosing: new Date(Date.now() + 95 * 86400000),
      },
      {
        companyId: brilliance.id,
        name: "Brilliance Skyline Penthouse Spec",
        municipalAddress: "1200 Skyline Ave SW, Calgary",
        status: ProjectStatus.IN_PROGRESS,
        progressPercent: 33,
        purchasePrice: 2450000,
      },
      {
        companyId: brilliance.id,
        name: "Brilliance Garden Suite Pair",
        municipalAddress: "3 Garden Court SE, Calgary",
        status: ProjectStatus.COMPLETED,
        progressPercent: 100,
        purchasePrice: 990000,
      },
    ],
  });

  console.log("Seed complete — demo data ready for role testing.");
  console.log(`Sunview projects: ${createdProjects.length} (all staff + all clients assigned)`);
  console.log("Login password for all demo users:", DEMO_PASSWORD);
  console.log("Accounts:");
  console.log("  justin.amaldas@gmail.com  ALL ROLES (switch in profile menu)");
  console.log("  owner@sunview.homes       OWNER");
  console.log("  ceo@sunview.homes         CEO");
  console.log("  admin@sunview.homes       OPERATIONS_ADMIN");
  console.log("  sales@sunview.homes       SALES_MANAGER");
  console.log("  pm@sunview.homes          PROJECT_MANAGER");
  console.log("  books@sunview.homes       BOOKKEEPER");
  console.log("  sub@sunview.homes         SUBCONTRACTOR");
  console.log("  client@example.com        CLIENT (Jordan)");
  console.log("  client2@example.com       CLIENT (Morgan)");
  console.log("  client3@example.com       CLIENT (Avery)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
