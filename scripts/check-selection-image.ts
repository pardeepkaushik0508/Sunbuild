import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const table = await prisma.$queryRaw<Array<{ e: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'SelectionImage'
    ) as e
  `;
  console.log("SelectionImage exists:", table[0]?.e);

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'SelectionImage'
    ORDER BY ordinal_position
  `;
  console.log(
    "columns:",
    cols.map((c) => c.column_name).join(", ") || "(none)"
  );

  // Probe Cloudinary env the same way the app does
  const raw = process.env.CLOUDINARY_URL?.trim();
  console.log("CLOUDINARY_URL set:", Boolean(raw));
  console.log("NODE_ENV:", process.env.NODE_ENV);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
