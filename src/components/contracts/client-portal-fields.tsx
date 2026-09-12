"use client";

import { useState } from "react";
import { FormField, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

/** Optional client portal credentials collected at contract confirm. */
export function ClientPortalFields({
  defaultEmail,
  defaultChecked = true,
}: {
  defaultEmail?: string | null;
  defaultChecked?: boolean;
}) {
  const [enabled, setEnabled] = useState(
    Boolean(defaultChecked && defaultEmail)
  );

  return (
    <div className="md:col-span-2 space-y-4 rounded-[12px] border border-sb-border bg-sb-canvas/40 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="createClientPortal"
          value="1"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-sb-border"
        />
        <span>
          <span className="block text-sm font-semibold text-sb-ink">
            Create client login
          </span>
          <span className="mt-0.5 block text-xs text-sb-muted">
            Registers the buyer as a Client user so they can sign in and view
            this project (PM, schedule, documents, etc.).
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Client login email" required className="md:col-span-2">
            <Input
              name="clientLoginEmail"
              type="email"
              required
              defaultValue={defaultEmail ?? ""}
              placeholder="client@email.com"
            />
          </FormField>
          <FormField label="Set password" required>
            <PasswordInput
              name="clientPassword"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Min. 10 characters"
            />
          </FormField>
          <FormField label="Confirm password" required>
            <PasswordInput
              name="clientPasswordConfirm"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Re-enter password"
            />
          </FormField>
          <p className="md:col-span-2 text-xs text-sb-muted">
            Share these credentials with the client. They can log in at /login
            and open their project portal.
          </p>
        </div>
      ) : null}
    </div>
  );
}
