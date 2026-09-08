/**
 * Dev helper: reset MFA for demo owner so they can re-enroll with QR.
 * Run: npx tsx scripts/reset-owner-mfa.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "owner@sunview.homes" },
  });
  if (!user) {
    console.error("owner@sunview.homes not found");
    process.exit(1);
  }

  const deleted = await prisma.twoFactor.deleteMany({
    where: { userId: user.id },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false },
  });

  console.log(
    `Reset MFA for ${user.email} (removed ${deleted.count} twoFactor row(s)).`
  );
  console.log("Login with Password123! then complete MFA via QR on /account/mfa");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
