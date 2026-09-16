import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function mask(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "****";
}

async function main() {
  const recent = await p.smsMessage.findMany({
    orderBy: { sentAt: "desc" },
    take: 8,
    select: {
      status: true,
      toNumber: true,
      errorCode: true,
      errorMessage: true,
      body: true,
      sentAt: true,
      direction: true,
    },
  });

  console.log(
    "SMS",
    JSON.stringify(
      recent.map((r) => ({
        status: r.status,
        to: mask(r.toNumber),
        err: r.errorCode,
        msg: r.errorMessage,
        body: (r.body || "").slice(0, 50),
        at: r.sentAt,
        dir: r.direction,
      })),
      null,
      2
    )
  );

  const subs = await p.membership.findMany({
    where: { role: "SUBCONTRACTOR", isActive: true },
    select: { user: { select: { name: true, phone: true } } },
    take: 20,
  });

  console.log(
    "SUBS",
    JSON.stringify(
      subs.map((s) => ({
        name: s.user.name,
        hasPhone: Boolean(s.user.phone),
        phoneTail: mask(s.user.phone),
      })),
      null,
      2
    )
  );

  const notifs = await p.notification.findMany({
    where: {
      type: {
        in: [
          "PROJECT_ASSIGNED",
          "SUBCONTRACTOR_ASSIGNED",
          "SUBCONTRACTOR_PROJECT_ASSIGNED",
          "TASK_ASSIGNED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { type: true, title: true, createdAt: true },
  });

  console.log("NOTIFS", JSON.stringify(notifs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
