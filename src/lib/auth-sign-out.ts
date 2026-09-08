"use client";

/**
 * Clears the Better Auth session and hard-navigates to login with replace
 * so the logout action itself does not leave a new history entry on top
 * of the protected page. Combined with no-store headers + AuthResumeGuard,
 * the browser back button cannot reopen a logged-out dashboard.
 */
export async function signOutAndRedirect(redirectTo = "/login") {
  const { authClient } = await import("@/lib/auth-client");
  try {
    await authClient.signOut();
  } finally {
    window.location.replace(redirectTo);
  }
}
