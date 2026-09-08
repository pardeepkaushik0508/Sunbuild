import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPasswordPolicy } from "@/lib/settings/store";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/settings/defaults";

/**
 * Public-safe password policy for reset/create forms.
 * Never returns secrets. Prefer company of authenticated user;
 * falls back to first active company / defaults for reset links.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    let companyId: string | null = null;
    if (session?.user?.id) {
      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, isActive: true },
        select: { companyId: true },
      });
      companyId = membership?.companyId ?? null;
    }

    if (!companyId) {
      const company = await prisma.company.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      companyId = company?.id ?? null;
    }

    const policy = companyId
      ? await getPasswordPolicy(companyId)
      : DEFAULT_PASSWORD_POLICY;

    return NextResponse.json({
      minLength: policy.minLength,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireNumber: policy.requireNumber,
      requireSpecial: policy.requireSpecial,
    });
  } catch {
    return NextResponse.json(DEFAULT_PASSWORD_POLICY);
  }
}
