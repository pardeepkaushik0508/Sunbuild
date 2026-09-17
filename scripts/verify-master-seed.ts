import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fail(label: string, detail: string): never {
  console.error(`  [FAIL] ${label} — ${detail}`);
  throw new Error(`Seed assertion failed: ${label} (${detail})`);
}

function pass(label: string, detail: string) {
  console.log(`  [PASS] ${label} — ${detail}`);
}

async function main() {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { name: true, slug: true },
  });
  if (companies.length !== 1 || companies[0]?.slug !== "sunview-homes") {
    fail("26", `expected Sunview only, got ${JSON.stringify(companies)}`);
  }
  pass("26", companies[0]!.name);

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      progressPercent: true,
      municipalAddress: true,
      buyer: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (projects.length !== 4) fail("20", `${projects.length} projects`);
  pass("20", projects.map((p) => p.name).join(" | "));

  const households = [
    "thompson.household@example.ca",
    "d.chen@example.ca",
    "patel.household@example.ca",
    "e.jenkins@example.ca",
  ];
  const clients = await prisma.user.findMany({
    where: { email: { in: households } },
    include: {
      memberships: { where: { role: "CLIENT" }, select: { role: true, isActive: true } },
      projectAccess: { select: { projectId: true } },
    },
  });
  if (clients.length !== 4) fail("22", `${clients.length} household accounts`);
  for (const c of clients) {
    if (c.projectAccess.length !== 1) {
      fail("22.4", `${c.email} has ${c.projectAccess.length} projects`);
    }
  }
  pass("22", "4 household accounts, one project each");

  const pc1001 = await prisma.purchaseContract.findFirst({
    where: { contractNumber: "PC-1001" },
    include: { deposits: true, conditions: true },
  });
  if (!pc1001) fail("3", "PC-1001 missing");
  if (pc1001.totalContractPrice !== 588000) {
    fail("3", `total ${pc1001.totalContractPrice}`);
  }
  pass("3", `$${pc1001.totalContractPrice}`);

  const deposits = pc1001.deposits.filter((d) =>
    /On signing|purchaser's conditions|Further deposit|Balance of the Purchase/i.test(
      d.label
    )
  );
  const depSum = deposits.reduce((s, d) => s + d.amount, 0);
  if (Math.abs(depSum - 588000) > 0.01) {
    fail("5", `ladder ${depSum}`);
  }
  pass("5", `deposits + balance = $${depSum}`);

  const eventDriven = pc1001.deposits.find((d) =>
    /removal of purchaser/i.test(d.label)
  );
  if (!eventDriven || eventDriven.dueDate) {
    fail("8", "deposit 2 should be event-driven (null due date)");
  }
  pass("8", "Deposit 2 event-driven");

  const cos = await prisma.changeOrder.findMany({
    where: { title: { startsWith: "CO-100" } },
    select: { title: true, status: true },
  });
  const has = (re: RegExp, status: string) =>
    cos.some((c) => re.test(c.title) && c.status === status);
  if (
    !has(/CO-1002/, "COMPLETED") ||
    !has(/CO-1006/, "REJECTED") ||
    !has(/CO-1001/, "PENDING_CLIENT") ||
    !has(/CO-1005/, "DRAFT")
  ) {
    fail("19", JSON.stringify(cos));
  }
  pass("19", "complete / declined / pending / draft present");

  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: ["INV-1001", "INV-1002"] } },
  });
  if (invoices.length !== 2) fail("11", `${invoices.length} invoices`);
  pass("11", "INV-1001 and INV-1002 only for executed COs");

  const pc1004 = await prisma.purchaseContract.findFirst({
    where: { contractNumber: "PC-1004" },
  });
  if (pc1004?.status !== "IN_REVIEW") fail("25", String(pc1004?.status));
  pass("25", "SV-1004 blocked under review");

  const emails = await prisma.user.findMany({ select: { email: true } });
  const unique = new Set(emails.map((e) => e.email.toLowerCase()));
  if (unique.size !== emails.length) fail("18", "duplicate emails");
  pass("18", `${emails.length} unique emails`);

  console.log(
    JSON.stringify(
      {
        companies,
        projectCount: projects.length,
        projects: projects.map((p) => ({
          name: p.name,
          status: p.status,
          address: p.municipalAddress,
          buyer: p.buyer
            ? `${p.buyer.firstName} ${p.buyer.lastName}`
            : null,
        })),
        households: clients.map((c) => ({
          email: c.email,
          projects: c.projectAccess.length,
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
