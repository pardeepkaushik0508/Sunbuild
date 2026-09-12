"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Search,
  X,
  MessageCircle,
  Home,
  Zap,
  Users,
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { cn, initials, whatsappLink, formatDate } from "@/lib/utils";

export type WhatsAppContact = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  preview?: string | null;
  unread?: number;
  kind?: "client" | "pm" | "sales" | "sub" | "group" | "team";
};

type ChatMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  senderName?: string | null;
  body: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  errorMessage?: string | null;
  sentAt: string | Date;
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

  // Chat thread state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatConfigured, setChatConfigured] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const active = contacts.find((c) => c.id === activeId) || null;

  // Load chat messages when active contact changes
  useEffect(() => {
    if (!active || !active.phone) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingChat(true);
    setChatError(null);

    const params = new URLSearchParams();
    if (active.projectId) params.set("projectId", active.projectId);

    fetch(`/api/whatsapp/messages?${params.toString()}`)
      .then((r) => r.json())
      .then(
        (data: {
          messages?: ChatMessage[];
          configured?: boolean;
          error?: string;
        }) => {
          if (cancelled) return;
          if (data.messages) {
            setMessages(data.messages);
          }
          if (typeof data.configured === "boolean") {
            setChatConfigured(data.configured);
          }
          if (data.error && !data.messages) {
            setChatError(data.error);
          }
        }
      )
      .catch((err) => {
        if (!cancelled) setChatError("Failed to load messages.");
      })
      .finally(() => {
        if (!cancelled) setLoadingChat(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMessage.trim() || !active?.phone || !active?.projectId || sending)
      return;

    const text = inputMessage.trim();
    setInputMessage("");
    setSending(true);
    setChatError(null);

    // Optimistic UI item
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      direction: "OUTBOUND",
      body: text,
      status: "SENT",
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: active.projectId,
          toPhone: active.phone,
          body: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  status: "FAILED",
                  errorMessage: data.error || "Send failed",
                }
              : m
          )
        );
        setChatError(data.error || "Failed to send message via Meta Cloud API.");
      } else if (data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: "FAILED", errorMessage: "Network error" }
            : m
        )
      );
      setChatError("Network error sending message.");
    } finally {
      setSending(false);
    }
  }

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

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/30"
        aria-label="Close WhatsApp panel"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[380px] flex-col border-l border-[#e5e7eb] bg-white shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3.5 bg-white">
          <div className="flex items-center gap-2">
            {active ? (
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#f3f4f6] text-[#4b5563]"
                aria-label="Back to contacts"
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <h2 className="text-[16px] font-bold text-[#111827]">
              {active ? active.name : "WhatsApp Business"}
            </h2>
            {!active && unreadTotal > 0 ? (
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

        {/* If no contact is selected, show contact list */}
        {!active ? (
          <>
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
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#fafafa]"
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
                ))
              )}
            </div>
          </>
        ) : (
          /* Active Contact Chat View */
          <div className="flex flex-1 min-h-0 flex-col bg-[#f0f2f5]">
            {/* Contact Subhead */}
            <div className="flex items-center justify-between border-b border-[#e5e7eb] bg-white px-4 py-2 text-xs">
              <div className="truncate">
                <span className="font-medium text-[#111827]">{active.role}</span>
                {active.projectName ? (
                  <span className="text-[#6b7280]"> · {active.projectName}</span>
                ) : null}
                {active.phone ? (
                  <p className="text-[11px] text-[#9ca3af]">{active.phone}</p>
                ) : null}
              </div>
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
                  title="Open WhatsApp Web"
                  className="inline-flex items-center gap-1 rounded-md border border-[#25D366] bg-white px-2 py-1 text-[11px] font-medium text-[#1ebe57] hover:bg-[#25D366]/10"
                >
                  <MessageCircle size={12} />
                  Web
                </a>
              ) : null}
            </div>

            {/* Cloud API Unconfigured Banner */}
            {!chatConfigured ? (
              <div className="flex items-center gap-2 bg-[#fffbeb] px-4 py-2 text-xs text-[#92400e] border-b border-[#fef3c7]">
                <AlertCircle size={14} className="shrink-0" />
                <span>
                  WhatsApp Cloud API test mode. Outbound messages log locally;
                  live web links available.
                </span>
              </div>
            ) : null}

            {/* Error Message */}
            {chatError ? (
              <div className="flex items-center gap-2 bg-[#fef2f2] px-4 py-2 text-xs text-[#b91c1c] border-b border-[#fecaca]">
                <AlertCircle size={14} className="shrink-0" />
                <span>{chatError}</span>
              </div>
            ) : null}

            {/* Message History */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
              {loadingChat ? (
                <p className="text-center text-xs text-[#6b7280] py-8">
                  Loading conversation…
                </p>
              ) : messages.length === 0 ? (
                <div className="text-center py-10">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#dcf8c6] text-[#075e54] mb-2">
                    <MessageCircle size={20} />
                  </div>
                  <p className="text-xs font-medium text-[#111827]">
                    Start a conversation
                  </p>
                  <p className="text-[11px] text-[#6b7280] mt-1 max-w-[220px] mx-auto">
                    Messages sent here link directly to {active.name}&apos;s project
                    thread.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isOutbound = m.direction === "OUTBOUND";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col max-w-[82%]",
                        isOutbound ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 text-[13px] shadow-sm leading-relaxed",
                          isOutbound
                            ? "bg-[#d9fdd3] text-[#111827] rounded-tr-none"
                            : "bg-white text-[#111827] rounded-tl-none"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                          <span>
                            {new Date(m.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isOutbound ? (
                            m.status === "READ" ? (
                              <CheckCheck size={12} className="text-[#53bdeb]" />
                            ) : m.status === "DELIVERED" ? (
                              <CheckCheck size={12} className="text-[#8696a0]" />
                            ) : m.status === "FAILED" ? (
                              <AlertCircle size={12} className="text-[#ea4335]" />
                            ) : (
                              <Check size={12} className="text-[#8696a0]" />
                            )
                          ) : null}
                        </div>
                      </div>
                      {m.errorMessage ? (
                        <p className="text-[10px] text-[#dc2626] mt-0.5">
                          {m.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Box */}
            <div className="border-t border-[#e5e7eb] bg-[#f0f2f5] p-3">
              {active.phone ? (
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type a WhatsApp message…"
                    className="flex-1 rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af] focus:border-[#25D366]"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || sending}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white transition hover:bg-[#1ebe57] disabled:opacity-50"
                    aria-label="Send WhatsApp message"
                  >
                    <Send size={15} />
                  </button>
                </form>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-[#dc2626]">
                    No phone number registered for this contact.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
