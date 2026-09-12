/**
 * Ensures Justin demo user exists with working credentials + all roles.
 * Does not print secrets.
 */
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const EMAIL = "justin.amaldas@gmail.com";
const PASSWORD = "Password123!";

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  let user = await prisma.user.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: EMAIL,
        name: "Justin Amaldas",
        phone: "14035550100",
        isActive: true,
        emailVerified: true,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: "Justin Amaldas",
        phone: "14035550100",
        isActive: true,
        emailVerified: true,
      },
    });
  }

  await prisma.account.deleteMany({
    where: { userId: user.id, providerId: "credential" },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    },
  });

  const company = await prisma.company.findUnique({
    where: { slug: "sunview-homes" },
  });
  if (!company) {
    throw new Error("Company sunview-homes not found — run full seed first");
  }

  const roles: Array<{
    role: Role;
    canEditSettings?: boolean;
    financeAccess?: boolean;
  }> = [
    { role: Role.OWNER, canEditSettings: true, financeAccess: true },
    { role: Role.CEO },
    { role: Role.OPERATIONS_ADMIN, canEditSettings: true },
    { role: Role.SALES_MANAGER },
    { role: Role.PROJECT_MANAGER },
    { role: Role.BOOKKEEPER, financeAccess: true },
    { role: Role.SUBCONTRACTOR },
    { role: Role.CLIENT },
  ];

  for (const r of roles) {
    await prisma.membership.upsert({
      where: {
        userId_companyId_role: {
          userId: user.id,
          companyId: company.id,
          role: r.role,
        },
      },
      update: {
        isActive: true,
        canEditSettings: r.canEditSettings ?? false,
        financeAccess: r.financeAccess ?? false,
      },
      create: {
        userId: user.id,
        companyId: company.id,
        role: r.role,
        canEditSettings: r.canEditSettings ?? false,
        financeAccess: r.financeAccess ?? false,
      },
    });
  }

  // Project access for scoped roles
  const projects = await prisma.project.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  for (const p of projects) {
    await prisma.projectAccess.upsert({
      where: {
        projectId_userId: { projectId: p.id, userId: user.id },
      },
      update: { role: Role.PROJECT_MANAGER, canEdit: true },
      create: {
        projectId: p.id,
        userId: user.id,
        role: Role.PROJECT_MANAGER,
        canEdit: true,
      },
    });
  }

  const membershipCount = await prisma.membership.count({
    where: { userId: user.id, isActive: true },
  });
  const hasPassword = await prisma.account.count({
    where: { userId: user.id, providerId: "credential", password: { not: null } },
  });

  console.log("Justin account ready");
  console.log("  email:", EMAIL);
  console.log("  password set:", hasPassword > 0);
  console.log("  active memberships:", membershipCount);
  console.log("  project access:", projects.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
