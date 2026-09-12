"use server";

import { clearActiveMembershipCookie } from "@/lib/membership-cookie";

export async function clearActiveMembershipAction() {
  await clearActiveMembershipCookie();
}
