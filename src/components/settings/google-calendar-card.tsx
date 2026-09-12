"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PublicGoogleConnection } from "@/lib/google/types";

export function GoogleCalendarSettingsCard({
  connection,
  canManage,
  returnTo = "/owner/settings",
}: {
  connection: PublicGoogleConnection;
  canManage: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const statusLabel =
    connection.status === "CONNECTED"
      ? "Connected"
      : connection.status === "RECONNECT_REQUIRED"
        ? "Reconnect required"
        : connection.status === "ERROR"
          ? "Error"
          : "Not Connected";

  const description =
    connection.status === "CONNECTED" && connection.email
      ? `Connected as: ${connection.email}`
      : connection.status === "RECONNECT_REQUIRED"
        ? "Google access expired. Please reconnect."
        : !connection.configured
          ? "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable."
          : "Connect your Google account. Assigned tasks and synced meetings appear on your Google Calendar.";

  async function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/google/calendar/disconnect?returnTo=${encodeURIComponent(returnTo)}`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
          }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error || "Could not disconnect Google Calendar");
          setConfirming(false);
          return;
        }
        setConfirming(false);
        router.refresh();
      } catch {
        setError("Could not disconnect Google Calendar");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="sb-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-sb-ink">Google Calendar</p>
        <p className="mt-0.5 text-[13px] text-sb-muted">{description}</p>
        <p className="mt-1 text-[12px] font-medium text-sb-ink">
          Status: {statusLabel}
        </p>
        {error ? (
          <p className="mt-1 text-[12px] text-sb-red">{error}</p>
        ) : null}
        {confirming ? (
          <p className="mt-2 text-[12px] text-sb-muted">
            Disconnect stops Google sync. SUNBUILD schedule data is kept.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center">
        {!connection.configured ? (
          <Button variant="yellow" size="sm" disabled>
            Setup required
          </Button>
        ) : connection.status === "CONNECTED" ? (
          confirming ? (
            <>
              <Button
                variant="yellow"
                size="sm"
                disabled={pending || !canManage}
                onClick={disconnect}
              >
                {pending ? "Disconnecting…" : "Confirm disconnect"}
              </Button>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!canManage}
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </Button>
          )
        ) : (
          <a
            href={`/api/google/calendar/connect?returnTo=${encodeURIComponent(returnTo)}`}
            className={`inline-flex h-8 items-center justify-center rounded-[8px] border border-sb-yellow bg-sb-yellow px-3 text-xs text-sb-ink hover:bg-sb-yellow-dark ${
              !canManage ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {connection.status === "RECONNECT_REQUIRED"
              ? "Reconnect Google Calendar"
              : "Connect Google Calendar"}
          </a>
        )}
      </div>
    </div>
  );
}
