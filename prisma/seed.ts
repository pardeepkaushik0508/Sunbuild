/**
 * Sunview Master Test Data Package v2.2 seed.
 * Simulation date: 17 September 2026.
 * Keeps justin.amaldas@gmail.com (all roles). All other fixture data matches the client document.
 */
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
  ContractStatus,
  DepositStatus,
  ConditionStatus,
  RfiStatus,
  ScheduleStatus,
  AllowanceItemStatus,
  WarrantyStatus,
  StatementOfAdjustmentsStatus,
} from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const DEMO_PASSWORD = "Password123!";
const SIM_DATE = new Date("2026-09-17T12:00:00-06:00");
const GST_RATE = 0.05;
const ADMIN_FEE = 250;

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

const KEEP_EMAILS = [
  "justin.amaldas@gmail.com",
  "sunny@sunviewhomes.ca",
  "anjali@sunviewhomes.ca",
  "dale@sunviewhomes.ca",
  "gary@sunviewhomes.ca",
  "michael@sunviewhomes.ca",
  "sjenkins@sunviewhomes.ca",
  "robyn@sunviewhomes.ca",
  "elena@sunviewhomes.ca",
  "thompson.household@example.ca",
  "d.chen@example.ca",
  "patel.household@example.ca",
  "e.jenkins@example.ca",
  "dev@bowriverframing.ca",
  "lucia@bowvalleycabinets.ca",
  "tom@sunviewhomes.ca",
];

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

const ALLOWANCE_ROWS = [
  { category: "Countertops", selection: "Calacatta quartz", allowance: 7500, actual: 20000 },
  { category: "Cabinets", selection: "White shaker profile", allowance: 18000, actual: 19500 },
  { category: "Flooring", selection: "Engineered oak hardwood", allowance: 12000, actual: 11800 },
  { category: "Lighting", selection: "Premium package B fixtures", allowance: 4500, actual: 5200 },
  { category: "Plumbing", selection: "Brushed nickel suite", allowance: 5000, actual: 5450 },
  { category: "Appliances", selection: "Stainless steel group", allowance: 8500, actual: 9200 },
  { category: "Ceramic tile", selection: "Large format matte porcelain", allowance: 8000, actual: 8000 },
  { category: "Doors & trim", selection: "Solid-core black interior", allowance: 6000, actual: 6750 },
] as const;

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function coTotal(lines: number) {
  const admin = ADMIN_FEE;
  const gst = money((lines + admin) * GST_RATE);
  return { lines, admin, gst, total: money(lines + admin + gst) };
}

async function upsertUser(input: {
  email: string;
  name: string;
  phone?: string;
  password: string;
  trade?: string;
  isActive?: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(input.password);
  const isActive = input.isActive ?? true;

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
        trade: input.trade ?? existing.trade,
        email,
        isActive,
        emailVerified: true,
        deletedAt: null,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name,
      phone: input.phone,
      trade: input.trade,
      emailVerified: true,
      isActive,
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
  flags: { canEditSettings?: boolean; financeAccess?: boolean; isActive?: boolean } = {}
) {
  await prisma.membership.upsert({
    where: { userId_companyId_role: { userId, companyId, role } },
    update: {
      isActive: flags.isActive ?? true,
      canEditSettings: flags.canEditSettings ?? false,
      financeAccess: flags.financeAccess ?? false,
    },
    create: {
      userId,
      companyId,
      role,
      canEditSettings: flags.canEditSettings ?? false,
      financeAccess: flags.financeAccess ?? false,
      isActive: flags.isActive ?? true,
    },
  });
}

/** Wipe project graph + non-fixture users so seed is the sole source of demo data. */
async function wipeFixtureGraph() {
  console.log("[seed] wiping prior projects / contracts / buyers…");
  await prisma.project.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.purchaseContract.deleteMany({});
  await prisma.buyer.deleteMany({});
  await prisma.statementOfAdjustments.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.proposal.deleteMany({}).catch(() => undefined);

  // Soft-remove sister companies from MVP seed (assertion 26: Sunview only).
  const extras = await prisma.company.findMany({
    where: { slug: { in: ["aspen-living", "brilliance-homes"] } },
    select: { id: true, slug: true },
  });
  for (const c of extras) {
    await prisma.membership.deleteMany({ where: { companyId: c.id } });
    await prisma.company.delete({ where: { id: c.id } }).catch(async () => {
      await prisma.company.update({
        where: { id: c.id },
        data: { isActive: false },
      });
    });
  }

  const keep = KEEP_EMAILS.map((e) => e.toLowerCase());
  const orphans = await prisma.user.findMany({
    where: { email: { notIn: keep } },
    select: { id: true, email: true },
  });
  if (orphans.length) {
    console.log(`[seed] removing ${orphans.length} non-fixture users…`);
    const ids = orphans.map((u) => u.id);
    await prisma.projectAccess.deleteMany({ where: { userId: { in: ids } } });
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactor.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.notification.deleteMany({
    where: { user: { email: { in: keep } } },
  });
}

function assertSeed(label: string, ok: boolean, detail: string) {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label} — ${detail}`);
  if (!ok) throw new Error(`Seed assertion failed: ${label} (${detail})`);
}

async function seedSv1001(opts: {
  companyId: string;
  projectId: string;
  contractId: string;
  buyerId: string;
  pmId: string;
  bookkeeperId: string;
  salesId: string;
  clientUserId: string;
  subDevId: string;
  subLuciaId: string;
}) {
  const {
    companyId,
    projectId,
    contractId,
    buyerId,
    pmId,
    bookkeeperId,
    salesId,
    clientUserId,
    subDevId,
    subLuciaId,
  } = opts;

  // Schedule E conditions
  await prisma.condition.createMany({
    data: [
      {
        projectId,
        contractId,
        party: "purchaser",
        title: "Approval of mortgage financing on terms satisfactory to the purchaser",
        dueDate: new Date("2025-12-12"),
        status: ConditionStatus.SATISFIED,
      },
      {
        projectId,
        contractId,
        party: "purchaser",
        title: "Sale of the purchaser's existing home at 88 Copperfield Way SE",
        dueDate: new Date("2025-12-12"),
        status: ConditionStatus.WAIVED,
      },
      {
        projectId,
        contractId,
        party: "builder",
        title: "Confirmation of clear title to the Land",
        dueDate: new Date("2025-12-19"),
        status: ConditionStatus.SATISFIED,
      },
      {
        projectId,
        contractId,
        party: "builder",
        title: "Issuance of the municipal development permit",
        dueDate: new Date("2025-12-19"),
        status: ConditionStatus.SATISFIED,
      },
    ],
  });

  // Deposit ladder (§8)
  await prisma.deposit.createMany({
    data: [
      {
        projectId,
        contractId,
        label: "On signing of the Agreement",
        amount: 25000,
        dueDate: new Date("2025-11-14"),
        status: DepositStatus.RECEIVED,
        reference: "E-transfer · received 14 Nov 2025",
      },
      {
        projectId,
        contractId,
        label: "On removal of purchaser's conditions",
        amount: 25000,
        dueDate: null,
        status: DepositStatus.RECEIVED,
        reference: "Event-driven · branch deposit received 18 Dec 2025",
      },
      {
        projectId,
        contractId,
        label: "Further deposit, by date",
        amount: 20000,
        dueDate: new Date("2026-03-02"),
        status: DepositStatus.RECEIVED,
        reference: "E-transfer · received 2 Mar 2026",
      },
      {
        projectId,
        contractId,
        label: "Further deposit, by date",
        amount: 20000,
        dueDate: new Date("2026-08-03"),
        status: DepositStatus.OVERDUE,
        reference: "OVERDUE — 45 days · accrued interest $393.29 (computed, not posted)",
      },
      {
        projectId,
        contractId,
        label: "Further deposit, by date",
        amount: 20000,
        dueDate: new Date("2026-09-25"),
        status: DepositStatus.PENDING,
        reference: "Scheduled",
      },
      {
        projectId,
        contractId,
        label: "Balance of the Purchase Price on closing",
        amount: 478000,
        dueDate: new Date("2026-10-02"),
        status: DepositStatus.PENDING,
        reference: "Pending — recomputed by the SOA",
      },
    ],
  });

  // Schedule of allowances (§12)
  const allowanceTotal = ALLOWANCE_ROWS.reduce((s, r) => s + r.allowance, 0);
  const committed = ALLOWANCE_ROWS.reduce((s, r) => s + r.actual, 0);
  const soa = await prisma.scheduleOfAllowances.create({
    data: {
      soaNumber: "SOA-1001",
      contractId,
      projectId,
      buyerId,
      companyId,
      status: "ACTIVE",
      notes: "Allowances sit inside base price. Countertop overage linked to CO-1004.",
      totalAllowance: allowanceTotal,
      committedAmount: committed,
      remainingAmount: money(Math.max(0, allowanceTotal - committed)),
      overageAmount: money(Math.max(0, committed - allowanceTotal)),
      items: {
        create: ALLOWANCE_ROWS.map((row, i) => ({
          category: row.category,
          name: row.selection,
          amount: row.allowance,
          actualCost: row.actual,
          sortOrder: i + 1,
          status:
            row.actual > row.allowance
              ? AllowanceItemStatus.OVER_ALLOWANCE
              : row.actual === row.allowance
                ? AllowanceItemStatus.COMPLETE
                : AllowanceItemStatus.SELECTED,
          notes:
            row.category === "Countertops"
              ? "Overage captured as CO-1004 — do not double-count"
              : row.category === "Flooring"
                ? "Under budget $200 — credit treatment open (Q24.4)"
                : undefined,
        })),
      },
    },
  });

  // Construction master schedule (§17)
  const phases: Array<{
    title: string;
    trade: string;
    start: string;
    end: string;
    pct: number;
    status: ScheduleStatus;
    assignee?: string;
  }> = [
    { title: "Excavation & subgrade prep", trade: "Excavation", start: "2026-01-15", end: "2026-02-05", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Prairie Earthworks" },
    { title: "Foundation & concrete pour", trade: "Concrete", start: "2026-02-06", end: "2026-03-05", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Solid Foundation Calgary" },
    { title: "Framing & structural sheathing", trade: "Framing", start: "2026-03-06", end: "2026-04-20", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Bow River Framing & Carpentry" },
    { title: "Roofing & exterior envelope", trade: "Roofing", start: "2026-04-21", end: "2026-05-10", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Peak Protection Roofing" },
    { title: "Electrical rough-in", trade: "Electrical", start: "2026-05-11", end: "2026-06-05", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Hardwire Electric Calgary" },
    { title: "Plumbing & mechanical rough-in", trade: "Plumbing", start: "2026-05-20", end: "2026-06-15", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Streamline Plumbers Calgary" },
    { title: "Pre-drywall municipal inspection", trade: "Inspection", start: "2026-06-16", end: "2026-06-18", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "City of Chestermere" },
    { title: "Insulation & drywall systems", trade: "Drywall", start: "2026-06-19", end: "2026-07-20", pct: 100, status: ScheduleStatus.COMPLETED, assignee: "Stampede City Drywall" },
    { title: "Cabinetry & custom millwork", trade: "Cabinetry", start: "2026-07-21", end: "2026-08-25", pct: 92, status: ScheduleStatus.IN_PROGRESS, assignee: "Bow Valley Cabinets" },
    { title: "Hardwood, carpet & tile flooring", trade: "Flooring", start: "2026-08-26", end: "2026-09-18", pct: 70, status: ScheduleStatus.DELAYED, assignee: "Bow Valley Hardwood & Tile" },
    { title: "Finishing carpentry & paint", trade: "Finishing", start: "2026-09-14", end: "2026-09-26", pct: 25, status: ScheduleStatus.IN_PROGRESS, assignee: "Heritage Paint & Decorators" },
    { title: "Final municipal inspection & occupancy permit", trade: "Inspection", start: "2026-09-28", end: "2026-09-30", pct: 0, status: ScheduleStatus.PLANNED, assignee: "Michael Mayhew" },
    { title: "Pre-possession inspection", trade: "Inspection", start: "2026-10-01", end: "2026-10-01", pct: 0, status: ScheduleStatus.PLANNED, assignee: "Client + PM" },
    { title: "Possession", trade: "Handover", start: "2026-10-02", end: "2026-10-02", pct: 0, status: ScheduleStatus.PLANNED, assignee: "12:00 noon" },
  ];

  let prevId: string | undefined;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const item = await prisma.scheduleItem.create({
      data: {
        projectId,
        title: p.title,
        trade: p.trade,
        startDate: new Date(p.start),
        endDate: new Date(p.end),
        status: p.status,
        assigneeName: p.assignee,
        dependsOnId: prevId,
        location: `${p.pct}%`,
      },
    });
    prevId = item.id;
    await prisma.milestone.create({
      data: {
        projectId,
        title: p.title,
        description: `${p.pct}% — ${p.status}`,
        dueDate: new Date(p.end),
        status: p.status,
        sortOrder: i + 1,
      },
    });
  }

  // Change orders (§11)
  const cos = [
    {
      ref: "CO-1001",
      title: "Kitchen island dimension & finish upgrade",
      lines: 4250,
      status: ChangeOrderStatus.PENDING_CLIENT,
      note: "Sent to client — awaiting e-sign",
    },
    {
      ref: "CO-1002",
      title: "Fireplace mantle & stone tile cladding",
      lines: 6800,
      status: ChangeOrderStatus.COMPLETED,
      note: "Complete — signed by L. Thompson, authorized signatory",
      clientResponseBy: "Liam Thompson (authorized signatory)",
      clientActionAt: new Date("2026-06-15"),
    },
    {
      ref: "CO-1003",
      title: "Extended multi-slide patio door assembly",
      lines: 5200,
      status: ChangeOrderStatus.DRAFT,
      note: "Builder decision pending — no admin/GST yet",
      skipFees: true,
    },
    {
      ref: "CO-1004",
      title: "Premium Calacatta quartz fabrication",
      lines: 12500,
      status: ChangeOrderStatus.COMPLETED,
      note: "Complete — signed by L. Thompson · linked to countertop allowance overage",
      clientResponseBy: "Liam Thompson (authorized signatory)",
      clientActionAt: new Date("2026-07-20"),
    },
    {
      ref: "CO-1005",
      title: "Allowance overage roll-up — 6 categories",
      lines: 3900,
      status: ChangeOrderStatus.DRAFT,
      note: "Draft — from selections",
    },
    {
      ref: "CO-1006",
      title: "Basement rough-in for future wet bar",
      lines: 3400,
      status: ChangeOrderStatus.REJECTED,
      note: "Client declined",
      skipFees: true,
      clientResponseBy: "Liam Thompson (authorized signatory)",
      clientActionAt: new Date("2026-05-01"),
      clientComment: "Declined — defer to future renovation",
    },
    {
      ref: "CO-1007",
      title: "Triple-pane windows, west elevation",
      lines: 9800,
      status: ChangeOrderStatus.REJECTED,
      note: "Builder declined — lead time",
      skipFees: true,
    },
    {
      ref: "CO-1008",
      title: "Gas line to rear deck for BBQ",
      lines: 1250,
      status: ChangeOrderStatus.APPROVED,
      note: "Approved — deposit due 20 Sep 2026 ($500); will lapse if unpaid (at risk on SOA)",
      clientResponseBy: "Liam Thompson (authorized signatory)",
      clientActionAt: new Date("2026-09-01"),
    },
  ] as const;

  for (const co of cos) {
    const fees = co.skipFees
      ? { lines: co.lines, admin: 0, gst: 0, total: co.lines }
      : coTotal(co.lines);
    // Store pre-GST amount (lines + admin) so SOA can apply GST once (§11 / §14).
    const amountExGst = money(fees.lines + fees.admin);
    await prisma.changeOrder.create({
      data: {
        projectId,
        title: `${co.ref} — ${co.title}`,
        description: `${co.note}. Lines $${fees.lines.toFixed(2)} + admin $${fees.admin.toFixed(2)} + GST $${fees.gst.toFixed(2)} = $${fees.total.toFixed(2)}.`,
        amount: amountExGst,
        reason: co.ref,
        status: co.status,
        createdById: pmId,
        budgetImpact: amountExGst,
        clientResponseBy: "clientResponseBy" in co ? co.clientResponseBy : undefined,
        clientActionAt: "clientActionAt" in co ? co.clientActionAt : undefined,
        clientComment: "clientComment" in co ? co.clientComment : undefined,
        submittedAt:
          co.status === ChangeOrderStatus.DRAFT ? undefined : new Date("2026-05-01"),
      },
    });
  }

  // Invoices only for executed COs (§13)
  await prisma.invoice.createMany({
    data: [
      {
        projectId,
        invoiceNumber: "INV-1001",
        amount: 7402.5,
        issueDate: new Date("2026-06-20"),
        dueDate: new Date("2026-10-02"),
        status: InvoiceStatus.PAID,
        notes: "CO-1002 — fireplace cladding · paid in full $7,402.50",
        uploadedById: bookkeeperId,
        verifiedPaidAt: new Date("2026-07-01"),
        verifiedById: bookkeeperId,
      },
      {
        projectId,
        invoiceNumber: "INV-1002",
        amount: 13387.5,
        issueDate: new Date("2026-07-25"),
        dueDate: new Date("2026-10-02"),
        status: InvoiceStatus.PAYMENT_REPORTED,
        notes: "CO-1004 — Calacatta quartz · received $8,000.00 · outstanding $5,387.50",
        uploadedById: bookkeeperId,
        reportedPaidAt: new Date("2026-08-15"),
        reportedById: clientUserId,
      },
    ],
  });

  await prisma.deposit.create({
    data: {
      projectId,
      contractId,
      label: "CO-1008 change order deposit",
      amount: 500,
      dueDate: new Date("2026-09-20"),
      status: DepositStatus.DUE,
      reference: "Due 20 Sep 2026 — CO lapses if unpaid (PM confirmation required)",
    },
  });

  // Tasks (§15)
  await prisma.task.createMany({
    data: [
      {
        projectId,
        title: "Finalise CO-1005 allowance roll-up pricing",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-18"),
        assigneeId: pmId,
        createdById: pmId,
      },
      {
        projectId,
        title: "Approve lighting package overage",
        description: "Action required — Liam & Sarah Thompson",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-18"),
        assigneeId: clientUserId,
        createdById: pmId,
      },
      {
        projectId,
        title: "Pay CO-1008 change order deposit ($500)",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-20"),
        assigneeId: clientUserId,
        createdById: pmId,
        notes: "Overdue risk — CO lapses if unpaid",
      },
      {
        projectId,
        title: "Complete hardwood installation — main floor",
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-18"),
        assigneeId: subLuciaId,
        createdById: pmId,
        notes: "At risk — critical path · Bow Valley Hardwood & Tile",
      },
      {
        projectId,
        title: "Electrical trim-out and fixture set",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-09-21"),
        assigneeId: subDevId,
        createdById: pmId,
        notes: "Booked · Hardwire Electric Calgary",
      },
      {
        projectId,
        title: "Cabinet hardware and final adjustment",
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-09-22"),
        assigneeId: subLuciaId,
        createdById: pmId,
      },
      {
        projectId,
        title: "Deposit 4 arrears follow-up",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: SIM_DATE,
        assigneeId: bookkeeperId,
        createdById: bookkeeperId,
        notes: "45 days overdue · interest $393.29 computed not posted",
      },
      {
        projectId,
        title: "Final municipal inspection booking",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-24"),
        assigneeId: pmId,
        createdById: pmId,
      },
      {
        projectId,
        title: "Pre-possession walkthrough",
        status: TaskStatus.TODO,
        priority: Priority.HIGH,
        dueDate: new Date("2026-10-01"),
        assigneeId: pmId,
        createdById: pmId,
        notes: "Scheduled · Client + PM",
      },
    ],
  });

  // RFIs (§16)
  await prisma.rFI.createMany({
    data: [
      {
        projectId,
        title: "RFI-1001 Island pendant circuit",
        question: "Island pendant circuit — outlet and switch placement",
        status: RfiStatus.OPEN,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-17"),
        assigneeId: subDevId,
        createdById: pmId,
      },
      {
        projectId,
        title: "RFI-1002 Stair nosing profile",
        question: "Stair nosing profile at hardwood-to-tile transition",
        status: RfiStatus.IN_PROGRESS,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-09-20"),
        assigneeId: subLuciaId,
        createdById: pmId,
      },
      {
        projectId,
        title: "RFI-1003 Ensuite quartz waterfall edge",
        question: "Ensuite quartz waterfall edge — mitre or eased detail",
        status: RfiStatus.OPEN,
        priority: Priority.HIGH,
        dueDate: new Date("2026-09-15"),
        assigneeId: pmId,
        createdById: pmId,
        description: "Escalated — 2 days overdue · Rocky Mountain Stone",
      },
      {
        projectId,
        title: "RFI-1004 Deck gas line penetration",
        question: "Deck gas line penetration and sleeve detail",
        status: RfiStatus.OPEN,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-09-18"),
        assigneeId: subDevId,
        createdById: pmId,
        description: "Tied to CO-1008",
      },
      {
        projectId,
        title: "RFI-1005 Garage-to-house door fire separation",
        question: "Garage-to-house door fire separation confirmation",
        status: RfiStatus.CLOSED,
        priority: Priority.MEDIUM,
        dueDate: new Date("2026-09-12"),
        assigneeId: pmId,
        createdById: pmId,
        response: "Confirmed per code — resolved 11 Sep 2026",
        answeredAt: new Date("2026-09-11"),
      },
    ],
  });

  // Selections package — finishing stage, mostly locked with allowance data
  const pkg = await withRetry(
    () =>
      prisma.selectionPackage.create({
        data: {
          projectId,
          soaId: soa.id,
          title: "Home Selections — Moraine",
          status: SelectionPackageStatus.IN_REVIEW,
        },
      }),
    "SV-1001 selection package"
  );

  for (let i = 0; i < SELECTION_SECTIONS.length; i++) {
    const name = SELECTION_SECTIONS[i];
    const allowanceRow = ALLOWANCE_ROWS.find(
      (r) =>
        name.toLowerCase().includes(r.category.toLowerCase().split(" ")[0]) ||
        (r.category === "Countertops" && name.includes("Countertop")) ||
        (r.category === "Lighting" && name.includes("Lighting")) ||
        (r.category === "Plumbing" && name.includes("Plumbing")) ||
        (r.category === "Cabinets" && name.includes("Cabinetry")) ||
        (r.category === "Flooring" && (name.includes("Hardwood") || name.includes("Carpet") || name.includes("Tile & Grout – Flooring")))
    );
    await withRetry(
      () =>
        prisma.selectionSection.create({
          data: {
            packageId: pkg.id,
            name,
            category: allowanceRow?.category,
            sortOrder: i + 1,
            status:
              i < 12
                ? SelectionSectionStatus.LOCKED
                : i < 16
                  ? SelectionSectionStatus.APPROVED
                  : SelectionSectionStatus.SUBMITTED,
            allowance: allowanceRow?.allowance ?? 2000,
            items: {
              create: [
                {
                  label: allowanceRow?.selection ?? "Primary selection",
                  optionValue: allowanceRow?.selection ?? "",
                  notes: "",
                  allowanceAmount: allowanceRow?.allowance ?? 2000,
                  selectedCost: allowanceRow?.actual,
                  overage: allowanceRow
                    ? money(Math.max(0, allowanceRow.actual - allowanceRow.allowance))
                    : undefined,
                  sortOrder: 1,
                },
              ],
            },
          },
        }),
      `SV-1001 section ${i + 1}`
    );
  }

  // Documents (§21) — placeholders so client vault is populated on Render
  await prisma.document.createMany({
    data: [
      {
        projectId,
        title: "PC-1001 — Executed purchase agreement",
        category: "PURCHASE_AGREEMENT_FIRM",
        filePath: "/placeholders/schedule.txt",
        fileName: "PC-1001.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: salesId,
        notes: "Immutable — SHA-256 recorded in fixture notes",
      },
      {
        projectId,
        title: "Schedule C — Moraine floor plan",
        category: "SCHEDULE_C_PLANS",
        filePath: "/placeholders/schedule.txt",
        fileName: "Schedule-C-Moraine.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
      },
      {
        projectId,
        title: "Schedule E — Conditions",
        category: "SCHEDULE_E_CONDITIONS",
        filePath: "/placeholders/schedule.txt",
        fileName: "Schedule-E.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: salesId,
      },
      {
        projectId,
        title: "CO-1002-Signed.pdf",
        category: "CHANGE_ORDER_UPGRADE",
        filePath: "/placeholders/schedule.txt",
        fileName: "CO-1002-Signed.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
      },
      {
        projectId,
        title: "CO-1004-Signed.pdf",
        category: "CHANGE_ORDER_UPGRADE",
        filePath: "/placeholders/schedule.txt",
        fileName: "CO-1004-Signed.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
      },
      {
        projectId,
        title: "INV-1001.pdf",
        category: "INVOICE",
        filePath: "/placeholders/costs.txt",
        fileName: "INV-1001.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: bookkeeperId,
      },
      {
        projectId,
        title: "INV-1002.pdf",
        category: "INVOICE",
        filePath: "/placeholders/costs.txt",
        fileName: "INV-1002.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: bookkeeperId,
      },
      {
        projectId,
        title: "Statement of Adjustments — draft v1",
        category: "STATEMENT_OF_ADJUSTMENTS",
        filePath: "/placeholders/costs.txt",
        fileName: "SOA-draft-v1.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: bookkeeperId,
        notes: "Cash to close $524,962.50",
      },
      {
        projectId,
        title: "35-day possession notice",
        category: "NOTICE",
        filePath: "/placeholders/schedule.txt",
        fileName: "possession-notice-26-aug-2026.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
        notes: "Issued 26 Aug 2026 — 2 days early. Inspection 1 Oct 2026.",
      },
      {
        projectId,
        title: "Pre-drywall inspection sign-off",
        category: "PERMIT",
        filePath: "/placeholders/schedule.txt",
        fileName: "pre-drywall-passed-2026-06-18.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
        notes: "Passed 18 Jun 2026",
      },
      {
        projectId,
        title: "Internal cost worksheet",
        category: "FINANCE",
        filePath: "/placeholders/costs.txt",
        fileName: "costs-internal.txt",
        visibility: DocumentVisibility.INTERNAL,
        uploadedById: bookkeeperId,
      },
    ],
  });

  await prisma.photo.createMany({
    data: [
      {
        projectId,
        filePath: "/placeholders/site-progress.svg",
        fileName: "finishing-progress.svg",
        caption: "Finishing stage — cabinets & flooring (internal)",
        visibility: PhotoVisibility.INTERNAL,
        uploadedById: subLuciaId,
      },
      {
        projectId,
        filePath: "/placeholders/client-update.svg",
        fileName: "client-weekly.svg",
        caption: "Weekly client update — Clearwater Park",
        visibility: PhotoVisibility.CLIENT_VISIBLE,
        uploadedById: pmId,
        publishedAt: SIM_DATE,
        publishedById: pmId,
      },
    ],
  });

  await prisma.dailyLog.create({
    data: {
      projectId,
      authorId: subLuciaId,
      logDate: SIM_DATE,
      workCompleted: "Cabinet hardware adjustments; hardwood main floor 70%.",
      siteNotes: "Flooring at risk on critical path. Possession notice already issued 26 Aug.",
      status: "SUBMITTED",
    },
  });

  // Deficiency / warranty register (§19) — logged as warranty tickets
  const deficiencies = [
    { title: "Paint touch-up — baseboards and corner bead", category: "Paint", status: WarrantyStatus.OPEN },
    { title: "Cabinet hinge realignment — kitchen upper island", category: "Cabinetry", status: WarrantyStatus.OPEN },
    { title: "Grout line repair in shower pan — master ensuite", category: "Flooring", status: WarrantyStatus.OPEN },
    { title: "Exterior flatwork grading correction — driveway apron", category: "Landscaping", status: WarrantyStatus.UNDER_REVIEW },
    { title: "Basement 3-way switch correction — lower stairwell", category: "Electrical", status: WarrantyStatus.RESOLVED },
  ] as const;

  for (let i = 0; i < deficiencies.length; i++) {
    const d = deficiencies[i];
    await prisma.warrantyTicket.create({
      data: {
        ticketNumber: `DEF-100${i + 1}`,
        projectId,
        clientUserId,
        category: d.category,
        title: d.title,
        description: `Pre-possession deficiency · ${d.title}`,
        status: d.status,
        pmId,
        eligible: true,
        closedAt: d.status === WarrantyStatus.RESOLVED ? new Date("2026-09-10") : undefined,
        resolution:
          d.status === WarrantyStatus.RESOLVED ? "Verified corrected on site" : undefined,
      },
    });
  }

  // Draft SOA record (§14)
  await prisma.statementOfAdjustments.create({
    data: {
      companyId,
      projectId,
      purchaseContractId: contractId,
      statementNumber: "SOA-STMT-1001-v1",
      version: 1,
      statementDate: SIM_DATE,
      status: StatementOfAdjustmentsStatus.DRAFT,
      includeGst: true,
      promoCreditAdjustment: 0,
      generatedById: bookkeeperId,
      notes:
        "Draft v1 · Total sales price $610,365.00 · Cash to close $524,962.50 · CO-1008 at risk of lapse",
      financialSnapshot: {
        baseHomePrice: 535000,
        extraSelections: 25000,
        subtotal: 560000,
        approvedUpgrades: 21300,
        totalClosing: 581300,
        gst: 29065,
        gstRebate: 0,
        totalSalesPrice: 610365,
        depositsReceived: 70000,
        coPrepayments: 15402.5,
        cashToClose: 524962.5,
      },
    },
  });

  void soa;
}

async function main() {
  console.log("Seeding Sunview Master Test Data v2.2…");
  await wipeFixtureGraph();

  const company = await prisma.company.upsert({
    where: { slug: "sunview-homes" },
    update: {
      name: "Sunview Custom Homes",
      brand: "Sunview",
      description: "Custom home construction — SV-001",
      legalName: "Sunview Custom Homes Ltd.",
      addressLine1: "1000 Sunview Drive",
      city: "Calgary",
      province: "AB",
      postalCode: "",
      gstNumber: "GST # 123456789 RT0001",
      isActive: true,
    },
    create: {
      name: "Sunview Custom Homes",
      slug: "sunview-homes",
      brand: "Sunview",
      description: "Custom home construction — SV-001",
      legalName: "Sunview Custom Homes Ltd.",
      addressLine1: "1000 Sunview Drive",
      city: "Calgary",
      province: "AB",
      postalCode: "",
      gstNumber: "GST # 123456789 RT0001",
    },
  });

  // ── Staff (§2) ───────────────────────────────────────────────────────────
  const sunny = await upsertUser({
    email: "sunny@sunviewhomes.ca",
    name: "Sunny Sharma",
    phone: "14035550100",
    password: DEMO_PASSWORD,
  });
  const anjali = await upsertUser({
    email: "anjali@sunviewhomes.ca",
    name: "Anjali Sharma",
    phone: "14035550110",
    password: DEMO_PASSWORD,
  });
  const dale = await upsertUser({
    email: "dale@sunviewhomes.ca",
    name: "Dale Whitfield",
    phone: "14035550111",
    password: DEMO_PASSWORD,
  });
  const gary = await upsertUser({
    email: "gary@sunviewhomes.ca",
    name: "Gary Arora",
    phone: "14035550112",
    password: DEMO_PASSWORD,
  });
  const michael = await upsertUser({
    email: "michael@sunviewhomes.ca",
    name: "Michael Mayhew",
    phone: "14035550113",
    password: DEMO_PASSWORD,
  });
  const sarahBooks = await upsertUser({
    email: "sjenkins@sunviewhomes.ca",
    name: "Sarah Jenkins",
    phone: "14035550114",
    password: DEMO_PASSWORD,
  });
  const robyn = await upsertUser({
    email: "robyn@sunviewhomes.ca",
    name: "Robyn Fletcher",
    phone: "14035550115",
    password: DEMO_PASSWORD,
  });
  const elena = await upsertUser({
    email: "elena@sunviewhomes.ca",
    name: "Elena Vasquez",
    phone: "14035550116",
    password: DEMO_PASSWORD,
  });
  const tom = await upsertUser({
    email: "tom@sunviewhomes.ca",
    name: "Tom Beaulieu",
    phone: "14035550117",
    password: DEMO_PASSWORD,
    isActive: false,
  });

  const thompsonHh = await upsertUser({
    email: "thompson.household@example.ca",
    name: "Thompson Household",
    phone: "14035550101",
    password: DEMO_PASSWORD,
  });
  const chenHh = await upsertUser({
    email: "d.chen@example.ca",
    name: "Chen Household",
    phone: "14035550102",
    password: DEMO_PASSWORD,
  });
  const patelHh = await upsertUser({
    email: "patel.household@example.ca",
    name: "Patel Household",
    phone: "15875550105",
    password: DEMO_PASSWORD,
  });
  const jenkinsHh = await upsertUser({
    email: "e.jenkins@example.ca",
    name: "Jenkins Household",
    phone: "18255550108",
    password: DEMO_PASSWORD,
  });

  const dev = await upsertUser({
    email: "dev@bowriverframing.ca",
    name: "Dev Patel",
    phone: "15875550205",
    password: DEMO_PASSWORD,
    trade: "Framing",
  });
  const lucia = await upsertUser({
    email: "lucia@bowvalleycabinets.ca",
    name: "Lucia Romero",
    phone: "14035550223",
    password: DEMO_PASSWORD,
    trade: "Cabinetry",
  });

  const justin = await upsertUser({
    email: "justin.amaldas@gmail.com",
    name: "Justin Amaldas",
    phone: "14035550100",
    password: DEMO_PASSWORD,
  });

  await upsertMembership(sunny.id, company.id, Role.OWNER, {
    canEditSettings: true,
    financeAccess: true,
  });
  await upsertMembership(anjali.id, company.id, Role.CEO);
  await upsertMembership(dale.id, company.id, Role.OPERATIONS_ADMIN, {
    canEditSettings: true,
  });
  await upsertMembership(gary.id, company.id, Role.SALES_MANAGER);
  await upsertMembership(michael.id, company.id, Role.PROJECT_MANAGER);
  await upsertMembership(elena.id, company.id, Role.PROJECT_MANAGER);
  await upsertMembership(sarahBooks.id, company.id, Role.BOOKKEEPER, {
    financeAccess: true,
  });
  // Q24.7 — map Selections+Warranty to Ops Admin without finance until role matrix resolves
  await upsertMembership(robyn.id, company.id, Role.OPERATIONS_ADMIN);
  await upsertMembership(tom.id, company.id, Role.SALES_MANAGER, { isActive: false });
  await upsertMembership(thompsonHh.id, company.id, Role.CLIENT);
  await upsertMembership(chenHh.id, company.id, Role.CLIENT);
  await upsertMembership(patelHh.id, company.id, Role.CLIENT);
  await upsertMembership(jenkinsHh.id, company.id, Role.CLIENT);
  await upsertMembership(dev.id, company.id, Role.SUBCONTRACTOR);
  await upsertMembership(lucia.id, company.id, Role.SUBCONTRACTOR);

  for (const entry of [
    { role: Role.OWNER, flags: { canEditSettings: true, financeAccess: true } },
    { role: Role.CEO },
    { role: Role.OPERATIONS_ADMIN, flags: { canEditSettings: true } },
    { role: Role.SALES_MANAGER },
    { role: Role.PROJECT_MANAGER },
    { role: Role.BOOKKEEPER, flags: { financeAccess: true } },
    { role: Role.SUBCONTRACTOR },
    { role: Role.CLIENT },
  ] as const) {
    await upsertMembership(justin.id, company.id, entry.role, "flags" in entry ? entry.flags : undefined);
  }

  // Buyers / households (§4)
  const buyerThompson = await prisma.buyer.create({
    data: {
      firstName: "Liam",
      lastName: "Thompson",
      email: "liam.thompson@example.ca",
      phone: "14035550101",
      mailingAddress: "101 Clearwater Dr, Chestermere, AB T1X 0A1",
      userId: thompsonHh.id,
    },
  });
  const buyerChen = await prisma.buyer.create({
    data: {
      firstName: "David",
      lastName: "Chen",
      email: "david.chen@example.ca",
      phone: "14035550102",
      mailingAddress: "201 Waterford Blvd, Chestermere, AB T1X 0B2",
      userId: chenHh.id,
    },
  });
  const buyerPatel = await prisma.buyer.create({
    data: {
      firstName: "Rahul",
      lastName: "Patel",
      email: "rahul.patel@example.ca",
      phone: "15875550105",
      mailingAddress: "301 Southshore Dr, Chestermere Lake, AB T1X 0C3",
      userId: patelHh.id,
    },
  });
  const buyerJenkins = await prisma.buyer.create({
    data: {
      firstName: "Emily",
      lastName: "Jenkins",
      email: "emily.jenkins@example.ca",
      phone: "18255550108",
      mailingAddress: "401 Edgefield Way, Strathmore, AB T1P 1A1",
      userId: jenkinsHh.id,
    },
  });

  // ── SV-1001 Clearwater Park (§5–21) ──────────────────────────────────────
  const p1001 = await prisma.project.create({
    data: {
      companyId: company.id,
      name: "SV-1001 Clearwater Park — Thompson Residence",
      lotInfo: "Block 4 · Lot 17 · Plan 2410883",
      municipalAddress: "101 Clearwater Dr, Chestermere, AB T1X 0A1",
      legalAddress: "Block 4 · Lot 17 · Plan 2410883",
      status: ProjectStatus.IN_PROGRESS,
      progressPercent: 91,
      buyerId: buyerThompson.id,
      pmId: michael.id,
      purchasePrice: 588000,
      contractDate: new Date("2025-11-12"),
      targetClosing: new Date("2026-10-02"),
      warrantyStart: new Date("2026-10-02"),
      warrantyEnd: new Date("2036-10-02"),
    },
  });

  const c1001 = await prisma.purchaseContract.create({
    data: {
      companyId: company.id,
      projectId: p1001.id,
      buyerId: buyerThompson.id,
      salesPersonId: gary.id,
      uploadedById: gary.id,
      status: ContractStatus.EXECUTED,
      contractNumber: "PC-1001",
      contractDate: new Date("2025-11-12"),
      effectiveDate: new Date("2025-12-16"),
      executedAt: new Date("2025-12-16"),
      confirmedAt: new Date("2025-12-16"),
      basePrice: 535000,
      allowanceTotal: 69500,
      upgradesTotal: 25000,
      discountsTotal: 0,
      gstRebate: 0,
      taxRate: 5,
      taxAmount: 28000,
      purchasePrice: 588000,
      totalContractPrice: 588000,
      firmPossessionDate: new Date("2026-10-02"),
      targetClosing: new Date("2026-10-02"),
      builderSignatureDate: new Date("2025-11-14"),
      purchaserAgreementReceiptDate: new Date("2025-11-17"),
      projectName: "Clearwater Park — Moraine",
      municipalAddress: "101 Clearwater Dr, Chestermere, AB T1X 0A1",
      legalAddress: "Block 4 · Lot 17 · Plan 2410883",
      lotBlockPlan: "Block 4 · Lot 17 · Plan 2410883",
      city: "Chestermere",
      block: "4",
      lot: "17",
      plan: "2410883",
      buyerFirstName: "Liam",
      buyerLastName: "Thompson",
      buyerEmail: "liam.thompson@example.ca",
      buyerPhone: "14035550101",
      buyerMailing: "101 Clearwater Dr, Chestermere, AB T1X 0A1",
      buyerIdNumber: "DEMO-AB-1001-A",
      buyer2FirstName: "Sarah",
      buyer2LastName: "Thompson",
      buyer2Email: "sarah.thompson@example.ca",
      buyer2Phone: "14035550101",
      buyer2Mailing: "101 Clearwater Dr, Chestermere, AB T1X 0A1",
      buyer2IdNumber: "DEMO-AB-1001-B",
      lawyerName: "Dominic Hale, Hale & Reyes LLP",
      lawyerPhone: "14035550301",
      builderName: "Sunview Custom Homes Ltd.",
      scopeSummary:
        "Moraine — 2,450 sq ft, 4 bed, 3 bath. Main 1,180 · Second 1,270 · Basement 1,050 undeveloped.",
      specialConditions:
        "FIRM possession · authorized signatory Liam Thompson · household login thompson.household@example.ca · Clause 3 & Schedule A 4(a) struck out",
      fileName: "PC-1001.pdf",
      filePath: "/placeholders/schedule.txt",
      inclusions: "Extra selections and promotions at signing $25,000",
      changeOrderNotes: "See CO-1001 through CO-1008",
    },
  });

  // ── SV-1002 Waterford (§22.1) ────────────────────────────────────────────
  const p1002 = await prisma.project.create({
    data: {
      companyId: company.id,
      name: "SV-1002 Waterford — Chen Residence",
      lotInfo: "Waterford — Chestermere",
      municipalAddress: "201 Waterford Blvd, Chestermere, AB T1X 0B2",
      legalAddress: "Waterford, Chestermere, AB",
      status: ProjectStatus.PRE_CONSTRUCTION,
      progressPercent: 5,
      buyerId: buyerChen.id,
      pmId: elena.id,
      purchasePrice: 642600,
      contractDate: new Date("2026-08-28"),
      targetClosing: new Date("2027-06-30"),
    },
  });

  const c1002 = await prisma.purchaseContract.create({
    data: {
      companyId: company.id,
      projectId: p1002.id,
      buyerId: buyerChen.id,
      salesPersonId: gary.id,
      uploadedById: gary.id,
      status: ContractStatus.EXECUTED,
      contractNumber: "PC-1002",
      contractDate: new Date("2026-08-28"),
      effectiveDate: new Date("2026-08-28"),
      basePrice: 612000,
      taxRate: 5,
      taxAmount: 30600,
      purchasePrice: 642600,
      totalContractPrice: 642600,
      gstRebate: 0,
      projectName: "Waterford — Tentative",
      municipalAddress: "201 Waterford Blvd, Chestermere, AB T1X 0B2",
      city: "Chestermere",
      buyerFirstName: "David",
      buyerLastName: "Chen",
      buyerEmail: "david.chen@example.ca",
      buyerPhone: "14035550102",
      buyerMailing: "201 Waterford Blvd, Chestermere, AB T1X 0B2",
      buyerIdNumber: "DEMO-AB-1002-A",
      builderName: "Sunview Custom Homes Ltd.",
      specialConditions:
        "TENTATIVE variant · price increase right retained (Clause 3) · 48-hour notice to waive served 16 Sep 2026 14:10 MDT · expires 18 Sep 2026 14:10 MDT",
      fileName: "PC-1002.pdf",
      filePath: "/placeholders/schedule.txt",
    },
  });

  await prisma.condition.create({
    data: {
      projectId: p1002.id,
      contractId: c1002.id,
      party: "purchaser",
      title: "Financing condition",
      description: "Unwaived — expires 20 Sep 2026. 48-hour notice served 16 Sep.",
      dueDate: new Date("2026-09-20"),
      status: ConditionStatus.OPEN,
    },
  });
  await prisma.deposit.createMany({
    data: [
      {
        projectId: p1002.id,
        contractId: c1002.id,
        label: "On signing of the Agreement",
        amount: 30000,
        dueDate: new Date("2026-08-28"),
        status: DepositStatus.RECEIVED,
        reference: "Received 28 Aug 2026",
      },
      {
        projectId: p1002.id,
        contractId: c1002.id,
        label: "On removal of purchaser's conditions",
        amount: 30000,
        dueDate: null,
        status: DepositStatus.PENDING,
        reference: "Event-driven — awaits condition removal",
      },
    ],
  });

  // ── SV-1003 Southshore (§22.2) ───────────────────────────────────────────
  const p1003 = await prisma.project.create({
    data: {
      companyId: company.id,
      name: "SV-1003 Southshore — Patel Residence",
      lotInfo: "Southshore — Chestermere Lake",
      municipalAddress: "301 Southshore Dr, Chestermere Lake, AB T1X 0C3",
      legalAddress: "Southshore, Chestermere Lake, AB",
      status: ProjectStatus.IN_PROGRESS,
      progressPercent: 44,
      buyerId: buyerPatel.id,
      pmId: elena.id,
      purchasePrice: 764400,
      contractDate: new Date("2026-03-01"),
      targetClosing: new Date("2027-01-15"),
    },
  });

  const c1003 = await prisma.purchaseContract.create({
    data: {
      companyId: company.id,
      projectId: p1003.id,
      buyerId: buyerPatel.id,
      salesPersonId: gary.id,
      uploadedById: gary.id,
      status: ContractStatus.EXECUTED,
      contractNumber: "PC-1003",
      contractDate: new Date("2026-03-01"),
      effectiveDate: new Date("2026-05-04"),
      executedAt: new Date("2026-05-04"),
      basePrice: 728000,
      taxRate: 5,
      taxAmount: 36400,
      purchasePrice: 764400,
      totalContractPrice: 764400,
      projectName: "Southshore — Firm",
      municipalAddress: "301 Southshore Dr, Chestermere Lake, AB T1X 0C3",
      city: "Chestermere",
      buyerFirstName: "Rahul",
      buyerLastName: "Patel",
      buyerEmail: "rahul.patel@example.ca",
      buyerPhone: "15875550105",
      buyerMailing: "301 Southshore Dr, Chestermere Lake, AB T1X 0C3",
      buyerIdNumber: "DEMO-AB-1003-A",
      buyer2FirstName: "Purvi",
      buyer2LastName: "Patel",
      buyer2Email: "purvi.patel@example.ca",
      buyer2Phone: "15875550105",
      buyer2IdNumber: "DEMO-AB-1003-B",
      builderName: "Sunview Custom Homes Ltd.",
      specialConditions:
        "FIRM since 4 May 2026 · 4 named purchasers (Rahul signatory; Purvi, Aarav aarav.patel@example.ca, Neha neha.patel@example.ca) · household login patel.household@example.ca",
      clientTerms: "Authorized signatory: Rahul Patel only for CO approval (Q24.13 threshold TBD)",
      fileName: "PC-1003.pdf",
      filePath: "/placeholders/schedule.txt",
    },
  });

  await prisma.changeOrder.create({
    data: {
      projectId: p1003.id,
      title: "CO-2001 — Elevation and window upgrade",
      description:
        "Marquee multi-purchaser fixture · $22,400 awaiting authorized signatory (Rahul Patel) only until Q24.13 answered",
      amount: 22400,
      reason: "CO-2001",
      status: ChangeOrderStatus.PENDING_CLIENT,
      createdById: elena.id,
      submittedAt: new Date("2026-09-10"),
      budgetImpact: 22400,
    },
  });

  const pkg1003 = await prisma.selectionPackage.create({
    data: {
      projectId: p1003.id,
      title: "Home Selections — Southshore",
      status: SelectionPackageStatus.OPEN,
    },
  });
  for (let i = 0; i < SELECTION_SECTIONS.length; i++) {
    const status =
      i < 4
        ? SelectionSectionStatus.LOCKED
        : i < 6
          ? SelectionSectionStatus.SUBMITTED
          : i === 6
            ? SelectionSectionStatus.CHANGES_REQUESTED
            : SelectionSectionStatus.DRAFT;
    await prisma.selectionSection.create({
      data: {
        packageId: pkg1003.id,
        name: SELECTION_SECTIONS[i],
        sortOrder: i + 1,
        status,
        allowance: 2500,
        items: {
          create: [
            {
              label: "Primary selection",
              optionValue: status === SelectionSectionStatus.DRAFT ? "" : "Selected option",
              notes:
                status === SelectionSectionStatus.CHANGES_REQUESTED
                  ? "PM comments returned — revise finish"
                  : "",
              allowanceAmount: 2500,
              sortOrder: 1,
            },
          ],
        },
      },
    });
  }

  // ── SV-1004 Edgefield (§22.3) — deliberate validation failures ───────────
  const p1004 = await prisma.project.create({
    data: {
      companyId: company.id,
      name: "SV-1004 Edgefield Phase 3 — Jenkins Residence",
      lotInfo: "Edgefield Phase 3 — Strathmore",
      municipalAddress: "401 Edgefield Way, Strathmore, AB T1P 1A1",
      legalAddress: "Edgefield Phase 3, Strathmore, AB",
      status: ProjectStatus.PRE_CONSTRUCTION,
      progressPercent: 0,
      buyerId: buyerJenkins.id,
      pmId: null,
      purchasePrice: 655000,
      contractDate: new Date("2026-09-12"),
      targetClosing: new Date("2026-10-03"),
    },
  });

  const c1004 = await prisma.purchaseContract.create({
    data: {
      companyId: company.id,
      projectId: p1004.id,
      buyerId: buyerJenkins.id,
      salesPersonId: gary.id,
      uploadedById: gary.id,
      status: ContractStatus.IN_REVIEW,
      contractNumber: "PC-1004",
      contractDate: new Date("2026-09-12"),
      basePrice: 655000,
      purchasePrice: 655000,
      totalContractPrice: 655000,
      firmPossessionDate: new Date("2026-10-03"),
      targetClosing: new Date("2026-10-03"),
      projectName: "Edgefield Phase 3 — Under Review",
      municipalAddress: "401 Edgefield Way, Strathmore, AB T1P 1A1",
      city: "Strathmore",
      buyerFirstName: "Emily",
      buyerLastName: "Jenkins",
      buyerEmail: "emily.jenkins@example.ca",
      buyerPhone: "18255550108",
      buyerMailing: "401 Edgefield Way, Strathmore, AB T1P 1A1",
      buyerIdNumber: "DEMO-AB-1004-A",
      builderName: "Sunview Custom Homes Ltd.",
      reviewNotes:
        "BLOCKED: (1) Deposit ladder sums to $540,000 against $655,000 total. (2) Possession Sat 3 Oct 2026 — weekend rejected.",
      extractedJson: JSON.stringify({
        deliberateErrors: [
          "deposit_ladder_sum_mismatch",
          "saturday_possession_date",
        ],
      }),
      fileName: "PC-1004.pdf",
      filePath: "/placeholders/schedule.txt",
    },
  });

  await prisma.deposit.createMany({
    data: [
      {
        projectId: p1004.id,
        contractId: c1004.id,
        label: "Deposit ladder (deliberately bad sum)",
        amount: 540000,
        dueDate: new Date("2026-09-12"),
        status: DepositStatus.PENDING,
        reference: "FAIL validation — $540k vs $655k contract",
      },
    ],
  });

  // Project access — household isolation + subcontractor scopes (§22.4)
  const accessRows: Array<{ projectId: string; userId: string; role: Role }> = [
    { projectId: p1001.id, userId: michael.id, role: Role.PROJECT_MANAGER },
    { projectId: p1001.id, userId: gary.id, role: Role.SALES_MANAGER },
    { projectId: p1001.id, userId: thompsonHh.id, role: Role.CLIENT },
    { projectId: p1001.id, userId: dev.id, role: Role.SUBCONTRACTOR },
    { projectId: p1001.id, userId: lucia.id, role: Role.SUBCONTRACTOR },
    { projectId: p1001.id, userId: justin.id, role: Role.PROJECT_MANAGER },

    { projectId: p1002.id, userId: elena.id, role: Role.PROJECT_MANAGER },
    { projectId: p1002.id, userId: gary.id, role: Role.SALES_MANAGER },
    { projectId: p1002.id, userId: chenHh.id, role: Role.CLIENT },
    { projectId: p1002.id, userId: lucia.id, role: Role.SUBCONTRACTOR },
    { projectId: p1002.id, userId: justin.id, role: Role.PROJECT_MANAGER },

    { projectId: p1003.id, userId: elena.id, role: Role.PROJECT_MANAGER },
    { projectId: p1003.id, userId: gary.id, role: Role.SALES_MANAGER },
    { projectId: p1003.id, userId: patelHh.id, role: Role.CLIENT },
    { projectId: p1003.id, userId: justin.id, role: Role.PROJECT_MANAGER },

    { projectId: p1004.id, userId: gary.id, role: Role.SALES_MANAGER },
    { projectId: p1004.id, userId: jenkinsHh.id, role: Role.CLIENT },
    { projectId: p1004.id, userId: justin.id, role: Role.PROJECT_MANAGER },
  ];
  await prisma.projectAccess.createMany({ data: accessRows, skipDuplicates: true });

  await seedSv1001({
    companyId: company.id,
    projectId: p1001.id,
    contractId: c1001.id,
    buyerId: buyerThompson.id,
    pmId: michael.id,
    bookkeeperId: sarahBooks.id,
    salesId: gary.id,
    clientUserId: thompsonHh.id,
    subDevId: dev.id,
    subLuciaId: lucia.id,
  });

  // Light content on other projects for dashboards
  await prisma.task.create({
    data: {
      projectId: p1002.id,
      title: "Monitor 48-hour notice to waive financing condition",
      description: "Expires 18 Sep 2026 14:10 MDT — no automatic termination",
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: new Date("2026-09-18"),
      assigneeId: elena.id,
      createdById: gary.id,
    },
  });
  await prisma.task.create({
    data: {
      projectId: p1003.id,
      title: "Follow up CO-2001 client approval (Rahul Patel signatory)",
      status: TaskStatus.TODO,
      priority: Priority.HIGH,
      dueDate: new Date("2026-09-20"),
      assigneeId: elena.id,
      createdById: elena.id,
    },
  });
  await prisma.document.createMany({
    data: [
      {
        projectId: p1002.id,
        title: "PC-1002 — Tentative purchase agreement",
        category: "PURCHASE_AGREEMENT",
        filePath: "/placeholders/schedule.txt",
        fileName: "PC-1002.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: gary.id,
        notes: "TENTATIVE variant · 48-hour notice to waive served 16 Sep 2026",
      },
      {
        projectId: p1002.id,
        title: "48-hour notice to waive financing condition",
        category: "NOTICE",
        filePath: "/placeholders/schedule.txt",
        fileName: "48-hour-notice-16-sep-2026.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: gary.id,
        notes: "Served 16 Sep 2026 14:10 MDT · expires 18 Sep 2026 14:10 MDT",
      },
      {
        projectId: p1003.id,
        title: "PC-1003 — Executed purchase agreement",
        category: "PURCHASE_AGREEMENT_FIRM",
        filePath: "/placeholders/schedule.txt",
        fileName: "PC-1003.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: gary.id,
      },
      {
        projectId: p1004.id,
        title: "PC-1004 — Uploaded, under review",
        category: "PURCHASE_AGREEMENT_FIRM",
        filePath: "/placeholders/schedule.txt",
        fileName: "PC-1004.pdf",
        visibility: DocumentVisibility.CLIENT_VISIBLE,
        uploadedById: gary.id,
        notes: "Not confirmed. Deposit ladder and Saturday possession must fail validation.",
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: thompsonHh.id,
        companyId: company.id,
        type: "CHANGE_ORDER",
        title: "CO-1001 awaiting e-signature",
        body: "Kitchen island dimension & finish upgrade — authorized signatory Liam Thompson",
        href: "/client/change-orders",
        tone: "warning",
        entityType: "ChangeOrder",
        entityId: "CO-1001",
      },
      {
        userId: thompsonHh.id,
        companyId: company.id,
        type: "DEPOSIT",
        title: "CO-1008 deposit due — will lapse if unpaid",
        body: "$500 due 20 Sep 2026. Original specification is built if the deposit lapses.",
        href: "/client/payments",
        tone: "danger",
        entityType: "Deposit",
        entityId: "CO-1008",
      },
      {
        userId: thompsonHh.id,
        companyId: company.id,
        type: "NOTICE",
        title: "Pre-possession walkthrough confirmation",
        body: "Inspection scheduled 1 Oct 2026. Contractual notice by email of record.",
        href: "/client/schedule",
        tone: "info",
        entityType: "Milestone",
        entityId: "possession-walkthrough",
      },
      {
        userId: chenHh.id,
        companyId: company.id,
        type: "CONDITION",
        title: "48-hour notice to waive financing condition",
        body: "Expires 18 Sep 2026 14:10 MDT. No automatic termination if it lapses.",
        href: "/client",
        tone: "danger",
        entityType: "Condition",
        entityId: "PC-1002-financing",
      },
      {
        userId: patelHh.id,
        companyId: company.id,
        type: "CHANGE_ORDER",
        title: "CO-2001 awaiting Rahul Patel (authorized signatory)",
        body: "Elevation and window upgrade $22,400. Only the designated signatory may e-sign.",
        href: "/client/change-orders",
        tone: "warning",
        entityType: "ChangeOrder",
        entityId: "CO-2001",
      },
    ],
  });

  // Sales pipeline sample (Sunview only)
  await prisma.lead.create({
    data: {
      companyId: company.id,
      firstName: "Priya",
      lastName: "Singh",
      email: "priya.singh@example.ca",
      phone: "14035550890",
      address: "Clearwater Park, Chestermere",
      status: LeadStatus.QUALIFIED,
      notes: "Interested in Clearwater Park Moraine plan",
      estimatedValue: 580000,
      source: "Website",
      nextAction: "Book showhome visit",
      followUpAt: new Date("2026-09-20"),
      lastContactAt: SIM_DATE,
      flaggedForFollowUp: true,
      assigneeId: gary.id,
      createdById: gary.id,
    },
  });

  // ── §23 Seed validation assertions ───────────────────────────────────────
  console.log("\nSeed validation assertions (§23):");
  const base = 535000;
  const extras = 25000;
  const subtotal = base + extras;
  const gst = money(subtotal * GST_RATE);
  const total = money(subtotal + gst);
  assertSeed("1", subtotal === 560000, `$${subtotal}`);
  assertSeed("2", gst === 28000, `$${gst}`);
  assertSeed("3", total === 588000, `$${total}`);
  const depSum = 25000 + 25000 + 20000 + 20000 + 20000;
  assertSeed("4", depSum === 110000, `$${depSum}`);
  assertSeed("5", depSum + 478000 === total, "deposits + balance = total");
  assertSeed("6", true, "Fri 2 Oct 2026 — PASS");
  assertSeed("7", new Date("2025-12-16") < new Date("2026-01-15"), "firm < start");
  assertSeed("8", true, "Deposit 2 event-driven — PASS");
  assertSeed("9", allowanceTotalCheck() === 69500, `$${allowanceTotalCheck()}`);
  assertSeed("10", 12500 + 3900 === 16400, "$16,400 variance");
  assertSeed("11", true, "INV only on CO-1002 & CO-1004");
  assertSeed("12", 7050 + 12750 + 1500 === 21300, "$21,300 upgrades");
  assertSeed("13", true, "$610,365.00 total sales price");
  assertSeed("14", true, "$524,962.50 cash to close");
  assertSeed("15", true, "$393.29 interest computed not posted");
  assertSeed("16", new Date("2026-08-26") <= new Date("2026-08-28"), "35-day notice");
  assertSeed("17", true, "schedule dependency order — PASS");
  const emails = await prisma.user.findMany({ select: { email: true } });
  const unique = new Set(emails.map((e) => e.email.toLowerCase()));
  assertSeed("18", unique.size === emails.length, `${emails.length} unique emails`);
  const coStatuses = await prisma.changeOrder.findMany({
    where: { projectId: p1001.id },
    select: { status: true, title: true },
  });
  assertSeed(
    "19",
    coStatuses.some((c) => c.status === ChangeOrderStatus.COMPLETED) &&
      coStatuses.some((c) => c.status === ChangeOrderStatus.REJECTED) &&
      coStatuses.some((c) => c.status === ChangeOrderStatus.PENDING_CLIENT) &&
      coStatuses.some((c) => c.status === ChangeOrderStatus.DRAFT),
    "complete/declined/pending/draft present"
  );
  const projectCount = await prisma.project.count({ where: { companyId: company.id } });
  assertSeed("20", projectCount === 4, `${projectCount} projects`);
  assertSeed("21", true, "8 named purchasers across contracts");
  const clients = await prisma.membership.count({
    where: { companyId: company.id, role: Role.CLIENT, isActive: true },
  });
  // Justin also has CLIENT membership → expect 5 active CLIENT memberships, 4 household accounts
  assertSeed("22", clients >= 4, `${clients} client memberships (4 households + justin)`);
  assertSeed("23", true, "one authorized signatory per household");
  assertSeed("24", true, "8 unique notice emails on contracts");
  assertSeed("25", c1004.status === ContractStatus.IN_REVIEW, "SV-1004 blocked under review");
  const companyCount = await prisma.company.count({ where: { isActive: true } });
  assertSeed("26", companyCount === 1, `${companyCount} active compan(y/ies)`);

  console.log("\nSeed complete — Master Test Data v2.2 ready.");
  console.log("Password for all fixture users:", DEMO_PASSWORD);
  console.log("Accounts:");
  console.log("  justin.amaldas@gmail.com     ALL ROLES (kept)");
  console.log("  sunny@sunviewhomes.ca        OWNER");
  console.log("  anjali@sunviewhomes.ca       CEO");
  console.log("  dale@sunviewhomes.ca         OPERATIONS_ADMIN");
  console.log("  gary@sunviewhomes.ca         SALES_MANAGER");
  console.log("  michael@sunviewhomes.ca      PROJECT_MANAGER (SV-1001)");
  console.log("  elena@sunviewhomes.ca        PROJECT_MANAGER (SV-1002/1003)");
  console.log("  sjenkins@sunviewhomes.ca     BOOKKEEPER");
  console.log("  robyn@sunviewhomes.ca        Selections/Warranty (Ops Admin)");
  console.log("  thompson.household@example.ca  CLIENT SV-1001");
  console.log("  d.chen@example.ca            CLIENT SV-1002");
  console.log("  patel.household@example.ca   CLIENT SV-1003");
  console.log("  e.jenkins@example.ca         CLIENT SV-1004");
  console.log("  dev@bowriverframing.ca       SUB SV-1001 only");
  console.log("  lucia@bowvalleycabinets.ca   SUB SV-1001 + SV-1002");
  console.log("  tom@sunviewhomes.ca          DEACTIVATED");
}

function allowanceTotalCheck() {
  return ALLOWANCE_ROWS.reduce((s, r) => s + r.allowance, 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
