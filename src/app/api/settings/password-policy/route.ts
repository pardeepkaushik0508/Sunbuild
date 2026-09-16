import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPasswordPolicy } from "@/lib/settings/store";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/settings/defaults";
import {
  AUTH_RATE,
  checkRateLimit,
  clientKeyFromHeaders,
} from "@/lib/rate-limit";

/**
 * Public-safe password policy for reset/create forms.
 * Never returns secrets. Prefer company of authenticated user;
 * falls back to first active company / defaults for reset links.
 */
export async function GET() {
  try {
    const h = await headers();
    const limited = checkRateLimit(
      clientKeyFromHeaders(h, "password-policy"),
      AUTH_RATE.limit,
      AUTH_RATE.windowMs
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
          },
        }
      );
    }

    const session = await auth.api.getSession({
      headers: h,
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
  } catch (error) {
    console.error("[password-policy] failed to load policy", error);
    return NextResponse.json(DEFAULT_PASSWORD_POLICY);
  }
}
