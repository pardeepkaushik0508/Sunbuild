/**
 * Safe one-time project closing-date update to 2027.
 *
 *   npx tsx scripts/set-project-closing-dates-2027.ts --dry-run
 *   npx tsx scripts/set-project-closing-dates-2027.ts --apply
 *
 * Updates ONLY Project.targetClosing. Deterministic per project id.
 */
import { PrismaClient } from "@prisma/client";
import {
  closingDateForProjectId,
  isYear2027,
} from "../src/lib/projects/closing-dates-2027";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, targetClosing: true },
    orderBy: { name: "asc" },
  });

  let updated = 0;
  let already = 0;

  console.log(dryRun ? "DRY RUN — no writes" : "APPLY — updating targetClosing");
  console.log("project\told\tnew");

  for (const project of projects) {
    const next = closingDateForProjectId(project.id);
    if (project.targetClosing && isYear2027(project.targetClosing)) {
      already += 1;
      console.log(
        `${project.name}\t${project.targetClosing.toISOString().slice(0, 10)}\talready 2027`
      );
      continue;
    }
    const oldLabel = project.targetClosing
      ? project.targetClosing.toISOString().slice(0, 10)
      : "(none)";
    console.log(`${project.name}\t${oldLabel}\t${next.toISOString().slice(0, 10)}`);
    if (!dryRun) {
      await prisma.project.update({
        where: { id: project.id },
        data: { targetClosing: next },
      });
    }
    updated += 1;
  }

  console.log(
    JSON.stringify({
      mode: dryRun ? "dry-run" : "apply",
      countUpdated: updated,
      countAlready2027: already,
      countSkipped: 0,
      total: projects.length,
    })
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
