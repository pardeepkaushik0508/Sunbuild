/**
 * Idempotent subcontractor directory sync from Master Test Data v2.2 §9.
 *
 *   npx tsx scripts/sync-subcontractor-directory.ts --dry-run
 *   npx tsx scripts/sync-subcontractor-directory.ts --apply --company=<id|slug>
 */
import { PrismaClient, Role } from "@prisma/client";
import {
  NAMED_SUBCONTRACTORS,
  subcontractorDirectory,
} from "../src/lib/users/subcontractor-directory";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const companyArg = process.argv.find((a) => a.startsWith("--company="))?.slice(10);
  const company = companyArg
    ? await prisma.company.findFirst({
        where: { OR: [{ id: companyArg }, { slug: companyArg }] },
      })
    : await prisma.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });

  if (!company) {
    console.error("No company found");
    process.exitCode = 1;
    return;
  }

  console.log(apply ? "APPLY" : "DRY RUN", "company=", company.slug);

  for (const named of NAMED_SUBCONTRACTORS) {
    const user = await prisma.user.findUnique({ where: { email: named.email } });
    console.log(
      `named ${named.name} <${named.email}> trade=${named.trade} ${user ? "exists" : "missing"}`
    );
    if (apply && user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { trade: named.trade, phone: named.phone, name: named.name },
      });
    }
  }

  let created = 0;
  let updated = 0;
  for (const vendor of subcontractorDirectory()) {
    const existing = await prisma.user.findUnique({
      where: { email: vendor.email },
      select: { id: true, name: true, trade: true, phone: true },
    });
    if (!existing) {
      console.log(`create ${vendor.company} <${vendor.email}> ${vendor.trade} ${vendor.phone}`);
      created += 1;
      if (apply) {
        const user = await prisma.user.create({
          data: {
            email: vendor.email,
            name: vendor.company,
            phone: vendor.phone,
            trade: vendor.trade,
            emailVerified: false,
          },
        });
        await prisma.membership.upsert({
          where: {
            userId_companyId_role: {
              userId: user.id,
              companyId: company.id,
              role: Role.SUBCONTRACTOR,
            },
          },
          update: { isActive: true },
          create: {
            userId: user.id,
            companyId: company.id,
            role: Role.SUBCONTRACTOR,
          },
        });
      }
      continue;
    }
    const needs =
      existing.trade !== vendor.trade ||
      existing.phone !== vendor.phone ||
      existing.name !== vendor.company;
    if (needs) {
      console.log(`update ${vendor.company} trade=${vendor.trade}`);
      updated += 1;
      if (apply) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: vendor.company,
            trade: vendor.trade,
            phone: vendor.phone,
          },
        });
      }
    }
  }

  console.log(JSON.stringify({ created, updated, apply, company: company.slug }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
