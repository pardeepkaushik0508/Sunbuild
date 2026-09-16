"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form";
import { useOptionalToast } from "@/components/ui/toast";
import { TWILIO_SEND_PATH } from "@/lib/twilio/constants";

export function SendSmsButton({
  toPhone,
  leadId,
  projectId,
  defaultBody,
  label = "Send SMS",
}: {
  toPhone?: string | null;
  leadId?: string;
  projectId?: string;
  defaultBody?: string;
  label?: string;
}) {
  const toast = useOptionalToast();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(defaultBody || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!toPhone && !leadId && !projectId) return null;

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(TWILIO_SEND_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toPhone || undefined,
          body: text,
          leadId,
          projectId,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        success?: boolean;
        diagnostic?: string;
        message?: { status?: string; errorMessage?: string | null };
      } | null;
      if (!res.ok) {
        const message = data?.error || "SMS could not be sent.";
        setError(message);
        toast?.error(message);
        return;
      }
      if (!data?.success) {
        const message =
          data?.diagnostic ||
          data?.message?.errorMessage ||
          "SMS was not delivered. If this is a Twilio trial, verify the recipient number or upgrade the account.";
        setError(message);
        toast?.error(message);
        return;
      }
      toast?.success("SMS sent");
      setOpen(false);
      setBody(defaultBody || "");
    } catch {
      const message = "Network error sending SMS.";
      setError(message);
      toast?.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => {
            if (e.target === e.currentTarget && !sending) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-[16px] border border-sb-border bg-sb-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold text-sb-ink">
                Send SMS
              </h2>
              <button
                type="button"
                onClick={() => !sending && setOpen(false)}
                className="rounded-lg p-1.5 text-sb-muted hover:bg-sb-canvas"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {toPhone ? (
              <p className="mb-3 text-sm text-sb-muted">To: {toPhone}</p>
            ) : (
              <p className="mb-3 text-sm text-sb-muted">
                Recipient is taken from the lead or project contact.
              </p>
            )}
            <FormField label="Message" required>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1600}
                rows={4}
                placeholder="Type the SMS…"
              />
            </FormField>
            {error ? (
              <p className="mt-2 text-sm text-sb-red">{error}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={send}
                disabled={sending || !body.trim()}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
