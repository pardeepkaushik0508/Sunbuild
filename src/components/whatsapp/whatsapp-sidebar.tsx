"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, MessageCircle, Home, Zap, Users } from "lucide-react";
import { cn, initials, whatsappLink } from "@/lib/utils";

export type WhatsAppContact = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  projectName?: string | null;
  preview?: string | null;
  unread?: number;
  kind?: "client" | "pm" | "sales" | "sub" | "group" | "team";
};

function Avatar({
  name,
  kind,
}: {
  name: string;
  kind?: WhatsAppContact["kind"];
}) {
  const icon =
    kind === "group" ? (
      <Users size={16} />
    ) : kind === "sub" ? (
      <Zap size={16} />
    ) : kind === "client" ? (
      <Home size={16} />
    ) : (
      <span className="text-[11px] font-bold">{initials(name)}</span>
    );

  return (
    <div className="relative">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white">
        {icon}
      </div>
      <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22c55e]" />
    </div>
  );
}

export function WhatsAppSidebar({
  open,
  onClose,
  contacts: initialContacts = [],
}: {
  open: boolean;
  onClose: () => void;
  contacts?: WhatsAppContact[];
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<WhatsAppContact[]>(initialContacts);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialContacts.length > 0) {
      setContacts(initialContacts);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/whatsapp/contacts")
      .then((r) => r.json())
      .then((data: { contacts?: WhatsAppContact[] }) => {
        if (!cancelled && Array.isArray(data.contacts)) {
          setContacts(data.contacts);
        }
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        (c.projectName || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    );
  }, [contacts, query]);

  const unreadTotal = contacts.reduce((sum, c) => sum + (c.unread || 0), 0);
  const active = contacts.find((c) => c.id === activeId) || null;

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/30"
        aria-label="Close WhatsApp panel"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[348px] flex-col border-l border-[#e5e7eb] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold text-[#111827]">
              WhatsApp Business
            </h2>
            {unreadTotal > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {unreadTotal}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#f3f4f6]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="flex h-10 items-center gap-2 rounded-full bg-[#f5f5f5] px-3 text-sm text-[#6b7280]">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-transparent outline-none placeholder:text-[#9ca3af]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-[#6b7280]">
              Loading contacts…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#6b7280]">
              No contacts with phone numbers yet.
            </p>
          ) : (
            filtered.map((c) => {
              const selected = activeId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                    selected ? "bg-[#f5f5f5]" : "hover:bg-[#fafafa]"
                  )}
                >
                  <Avatar name={c.name} kind={c.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[#111827]">
                          {c.name}
                        </p>
                        <p className="truncate text-[12px] text-[#888]">
                          {c.role}
                          {c.projectName ? ` · ${c.projectName}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-[#9ca3af]">CRM</p>
                        {c.unread ? (
                          <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1 text-[11px] font-semibold text-white">
                            {c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-[#444]">
                      {c.preview ||
                        (c.phone
                          ? `Tap to message ${c.phone}`
                          : "No phone on file")}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {active ? (
          <div className="border-t border-[#e5e7eb] bg-[#f9fafb] p-4">
            <p className="text-sm font-semibold text-[#111827]">{active.name}</p>
            <p className="text-xs text-[#6b7280]">
              {active.role}
              {active.projectName ? ` · ${active.projectName}` : ""}
            </p>
            <p className="mt-2 text-xs text-[#6b7280]">
              MVP uses WhatsApp deep-links with project context. Full Business API
              inbox can be connected later.
            </p>
            {active.phone ? (
              <a
                href={
                  whatsappLink(
                    active.phone,
                    `Hi ${active.name}, regarding ${active.projectName || "Sunview Homes"}`
                  ) || "#"
                }
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe57]"
              >
                <MessageCircle size={16} />
                Continue in WhatsApp
              </a>
            ) : (
              <p className="mt-3 text-sm text-[#dc2626]">
                Phone number missing for this contact.
              </p>
            )}
          </div>
        ) : null}
      </aside>
    </>
  );
}
