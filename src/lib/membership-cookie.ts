import { cookies } from "next/headers";

/** HttpOnly cookie storing the active Membership.id for multi-profile users. */
export const ACTIVE_MEMBERSHIP_COOKIE = "sb_active_membership";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function getActiveMembershipCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(ACTIVE_MEMBERSHIP_COOKIE)?.value?.trim();
  return value || null;
}

export async function setActiveMembershipCookie(membershipId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_MEMBERSHIP_COOKIE, membershipId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearActiveMembershipCookie() {
  const jar = await cookies();
  jar.delete(ACTIVE_MEMBERSHIP_COOKIE);
}
