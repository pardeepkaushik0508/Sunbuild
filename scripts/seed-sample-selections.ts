/**
 * Idempotent sample client-visible selections with images.
 *
 *   npx tsx scripts/seed-sample-selections.ts --dry-run
 *   npx tsx scripts/seed-sample-selections.ts --apply
 *
 * Never run automatically on production deploy.
 */
import { PrismaClient, SelectionPackageStatus, SelectionSectionStatus } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLES = [
  {
    key: "flooring",
    name: "Engineered oak hardwood",
    category: "Flooring",
    notes: "Wide-plank engineered oak, natural oil finish.",
    image:
      "/legacy-media/heroes/cmtyhlxy90053svuwxvxb5mrc/MDzMRMppaB_ScN6P_flooring-material-skirting-samples-carpet-260nw-2341199135.webp",
  },
  {
    key: "countertop",
    name: "Kitchen countertop — quartz",
    category: "Kitchen Countertop",
    notes: "Calacatta-look quartz, 3cm eased edge.",
    image: "/placeholders/site-progress.svg",
  },
  {
    key: "cabinets",
    name: "Cabinet finish — white shaker",
    category: "Cabinet Finish",
    notes: "Painted white shaker doors, soft-close hardware.",
    image: "/placeholders/client-update.svg",
  },
  {
    key: "tile",
    name: "Bathroom tile — matte porcelain",
    category: "Bathroom Tile",
    notes: "Large-format matte porcelain, rectified edge.",
    image: "/placeholders/site-progress.svg",
  },
  {
    key: "lighting",
    name: "Lighting fixture package B",
    category: "Lighting Fixture",
    notes: "Premium package B fixtures for main floor and primary suite.",
    image: "/placeholders/client-update.svg",
  },
  {
    key: "paint",
    name: "Paint colour — warm greige",
    category: "Paint Colour",
    notes: "Interior walls greige; trim extra white.",
    image: "/placeholders/site-progress.svg",
  },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const projects = await prisma.project.findMany({
    where: { deletedAt: null, buyerId: { not: null } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
    take: 6,
  });

  console.log(apply ? "APPLY sample selections" : "DRY RUN");
  let created = 0;
  let skipped = 0;

  for (const project of projects) {
    let pkg = await prisma.selectionPackage.findFirst({
      where: { projectId: project.id },
    });
    if (!pkg) {
      console.log(`${project.name}: would create package`);
      if (apply) {
        pkg = await prisma.selectionPackage.create({
          data: {
            projectId: project.id,
            title: "Home Selections",
            status: SelectionPackageStatus.OPEN,
          },
        });
      } else {
        skipped += SAMPLES.length;
        continue;
      }
    }

    for (const [index, sample] of SAMPLES.entries()) {
      const existing = await prisma.selectionSection.findFirst({
        where: {
          packageId: pkg.id,
          name: sample.name,
          category: sample.category,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        console.log(`${project.name} / ${sample.name}: exists`);
        continue;
      }
      console.log(`${project.name} / ${sample.name}: create`);
      if (!apply) {
        created += 1;
        continue;
      }
      const section = await prisma.selectionSection.create({
        data: {
          packageId: pkg.id,
          name: sample.name,
          category: sample.category,
          notes: sample.notes,
          clientVisible: true,
          status: SelectionSectionStatus.DRAFT,
          sortOrder: index + 1,
          items: {
            create: {
              label: sample.name,
              optionValue: "Shown option",
              notes: sample.notes,
              imageUrl: sample.image,
              sortOrder: 0,
            },
          },
          images: {
            create: {
              filePath: sample.image,
              fileName: `${sample.key}.webp`,
              caption: sample.name,
              sortOrder: 0,
            },
          },
        },
      });
      void section;
      created += 1;
    }
  }

  console.log(JSON.stringify({ created, skipped, apply }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
