"use client";

/**
 * Per-inbox view — three folders (Inbox / Sent / Drafts), a message-detail
 * pane, and a compose modal. All mail flows through MyAgentMail's REST API:
 *   GET    /v1/inboxes/{id}/messages?direction=inbound|outbound
 *   GET    /v1/inboxes/{id}/messages/{mid}            ← also marks read
 *   POST   /v1/inboxes/{id}/send                       ← compose new
 *   POST   /v1/inboxes/{id}/reply/{mid}                ← threaded reply
 *   GET/POST /v1/inboxes/{id}/drafts                   ← drafts list/create
 *   PATCH/DELETE /v1/inboxes/{id}/drafts/{did}         ← edit / discard
 *   POST   /v1/inboxes/{id}/drafts/{did}/send          ← send and consume draft
 *
 * The starter holds no mail state locally — MyAgentMail is the source of
 * truth. We poll inbound every 30s while the user is on the Inbox tab so
 * new mail surfaces without manual refresh.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Inbox as InboxIcon,
  Send,
  FilePen,
  Plus,
  RefreshCw,
  Trash2,
  Reply,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Folder = "inbox" | "sent" | "drafts";

type Message = {
  id: string;
  inboxId: string;
  threadId: string;
  direction: "inbound" | "outbound";
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | string;
  subject: string | null;
  plainBody: string | null;
  htmlBody: string | null;
  isRead: boolean;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

type Draft = {
  id: string;
  to: string[] | string | null;
  subject: string | null;
  plainBody: string | null;
  htmlBody: string | null;
  replyToMessageId: string | null;
  updatedAt: string;
  createdAt: string;
};

type InboxRecord = {
  id: string;
  email: string;
  displayName?: string;
};

export default function InboxDetailPage() {
  const params = useParams<{ id: string }>();
  const inboxId = params?.id;

  const [inbox, setInbox] = React.useState<InboxRecord | null>(null);
  const [folder, setFolder] = React.useState<Folder>("inbox");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = React.useState<Message | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [composing, setComposing] = React.useState<{
    mode: "new" | "reply" | "draft";
    to?: string;
    subject?: string;
    plainBody?: string;
    replyToMessageId?: string;
    draftId?: string;
  } | null>(null);

  const reload = React.useCallback(async () => {
    if (!inboxId) return;
    setLoading(true);
    if (folder === "drafts") {
      const r = await fetch(`/api/inboxes/${inboxId}/drafts`).then((r) => r.json());
      setDrafts(r.drafts || []);
    } else {
      const direction = folder === "sent" ? "outbound" : "inbound";
      const r = await fetch(
        `/api/inboxes/${inboxId}/messages?direction=${direction}&limit=100`,
      ).then((r) => r.json());
      setMessages(r.messages || []);
    }
    setLoading(false);
  }, [inboxId, folder]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // Resolve the inbox metadata once.
  React.useEffect(() => {
    if (!inboxId) return;
    fetch("/api/inboxes")
      .then((r) => r.json())
      .then((d) => {
        const found = (d.inboxes || []).find((i: InboxRecord) => i.id === inboxId);
        setInbox(found || null);
      })
      .catch(() => setInbox(null));
  }, [inboxId]);

  // Poll the inbox folder for new mail while the user has it open.
  React.useEffect(() => {
    if (folder !== "inbox") return;
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [folder, reload]);

  // When a message is selected, fetch the full body (and mark read).
  React.useEffect(() => {
    if (!selectedId || !inboxId || folder === "drafts") {
      setSelectedMessage(null);
      return;
    }
    fetch(`/api/inboxes/${inboxId}/messages/${selectedId}`)
      .then((r) => r.json())
      .then((d) => setSelectedMessage(d.message || null));
    // Optimistically mark read in the local list.
    setMessages((prev) => prev.map((m) => (m.id === selectedId ? { ...m, isRead: true } : m)));
  }, [selectedId, inboxId, folder]);

  function openCompose() {
    setComposing({ mode: "new" });
    setSelectedId(null);
  }

  function openReply(m: Message) {
    setComposing({
      mode: "reply",
      to: m.fromAddress || "",
      subject: m.subject?.startsWith("Re: ") ? m.subject : `Re: ${m.subject || ""}`,
      plainBody: "",
      replyToMessageId: m.id,
    });
  }

  function openDraft(d: Draft) {
    setComposing({
      mode: "draft",
      to: Array.isArray(d.to) ? d.to.join(", ") : d.to || "",
      subject: d.subject || "",
      plainBody: d.plainBody || "",
      draftId: d.id,
      replyToMessageId: d.replyToMessageId || undefined,
    });
  }

  async function deleteDraftLocal(id: string) {
    if (!inboxId) return;
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/inboxes/${inboxId}/drafts/${id}`, { method: "DELETE" });
    toast.success("Draft discarded");
    reload();
  }

  if (!inboxId) return null;

  const items = folder === "drafts" ? drafts : messages;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/inboxes"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          All inboxes
        </Link>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {inbox?.email || inboxId.slice(0, 8)}
          </h1>
          {inbox?.displayName ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Display name: {inbox.displayName}
            </p>
          ) : null}
        </div>
        <Button onClick={openCompose}>
          <Plus className="h-4 w-4" />
          Compose
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Folder rail */}
        <div className="space-y-1">
          <FolderButton
            active={folder === "inbox"}
            onClick={() => {
              setFolder("inbox");
              setSelectedId(null);
            }}
            icon={<InboxIcon className="h-4 w-4" />}
            label="Inbox"
            badge={
              messages.filter((m) => folder === "inbox" && !m.isRead).length || undefined
            }
          />
          <FolderButton
            active={folder === "sent"}
            onClick={() => {
              setFolder("sent");
              setSelectedId(null);
            }}
            icon={<Send className="h-4 w-4" />}
            label="Sent"
          />
          <FolderButton
            active={folder === "drafts"}
            onClick={() => {
              setFolder("drafts");
              setSelectedId(null);
            }}
            icon={<FilePen className="h-4 w-4" />}
            label="Drafts"
            badge={drafts.length || undefined}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full justify-start"
            onClick={reload}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Message list + reading pane */}
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <Card className="overflow-hidden">
            {loading && items.length === 0 ? (
              <div className="p-10 text-center text-xs text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-xs text-muted-foreground">
                {folder === "drafts" ? "No drafts." : "No messages."}
              </div>
            ) : folder === "drafts" ? (
              <ul className="divide-y">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => openDraft(d)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {d.subject || "(no subject)"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {fmtDate(d.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        To: {Array.isArray(d.to) ? d.to.join(", ") : d.to || "—"}
                      </p>
                      {d.plainBody ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {d.plainBody.slice(0, 140)}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y">
                {messages.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => setSelectedId(m.id)}
                      className={cn(
                        "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                        selectedId === m.id && "bg-muted/60",
                        !m.isRead && folder === "inbox" && "font-medium",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">
                          {folder === "inbox"
                            ? m.fromName || m.fromAddress || "(unknown)"
                            : `To: ${formatAddresses(m.toAddresses)}`}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {fmtDate(m.receivedAt || m.sentAt || m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs">
                        {m.subject || "(no subject)"}
                      </p>
                      {m.plainBody ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {m.plainBody.slice(0, 140)}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="min-h-[280px] overflow-hidden">
            {folder === "drafts" ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Click a draft on the left to open the composer.
              </div>
            ) : !selectedId ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Select a message to read it.
              </div>
            ) : !selectedMessage ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Loading…</div>
            ) : (
              <MessageView
                message={selectedMessage}
                onReply={() => openReply(selectedMessage)}
                onDelete={async () => {
                  if (!confirm("Delete this message?")) return;
                  await fetch(`/api/inboxes/${inboxId}/messages/${selectedMessage.id}`, {
                    method: "DELETE",
                  });
                  toast.success("Deleted");
                  setSelectedId(null);
                  reload();
                }}
              />
            )}
          </Card>
        </div>
      </div>

      {composing ? (
        <ComposeModal
          inboxId={inboxId}
          mode={composing.mode}
          initial={composing}
          onClose={() => setComposing(null)}
          onSent={() => {
            toast.success("Sent");
            setComposing(null);
            setFolder("sent");
            reload();
          }}
          onSavedDraft={() => {
            toast.success("Draft saved");
            if (folder === "drafts") reload();
          }}
          onDraftDiscarded={() => {
            setComposing(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function formatAddresses(addrs: string[] | string): string {
  if (!addrs) return "";
  if (Array.isArray(addrs)) return addrs.join(", ");
  return addrs;
}

function FolderButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <Badge variant="outline" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]">
          {badge}
        </Badge>
      ) : null}
    </button>
  );
}

function MessageView({
  message,
  onReply,
  onDelete,
}: {
  message: Message;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{message.subject || "(no subject)"}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            <strong className="text-foreground">From:</strong>{" "}
            {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress || "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            <strong className="text-foreground">To:</strong> {formatAddresses(message.toAddresses)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {fmtDate(message.receivedAt || message.sentAt || message.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {message.direction === "inbound" ? (
            <Button size="sm" variant="outline" onClick={onReply}>
              <Reply className="h-3.5 w-3.5" />
              Reply
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {message.htmlBody ? (
          // eslint-disable-next-line react/no-danger
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: message.htmlBody }} />
        ) : message.plainBody ? (
          <pre className="whitespace-pre-wrap font-sans text-sm">{message.plainBody}</pre>
        ) : (
          <p className="text-xs text-muted-foreground">(empty body)</p>
        )}
      </div>
    </div>
  );
}

function ComposeModal({
  inboxId,
  mode,
  initial,
  onClose,
  onSent,
  onSavedDraft,
  onDraftDiscarded,
}: {
  inboxId: string;
  mode: "new" | "reply" | "draft";
  initial: { to?: string; subject?: string; plainBody?: string; replyToMessageId?: string; draftId?: string };
  onClose: () => void;
  onSent: () => void;
  onSavedDraft: () => void;
  onDraftDiscarded: () => void;
}) {
  const [to, setTo] = React.useState(initial.to || "");
  const [subject, setSubject] = React.useState(initial.subject || "");
  const [body, setBody] = React.useState(initial.plainBody || "");
  const [verified, setVerified] = React.useState(false);
  const [draftId, setDraftId] = React.useState<string | null>(initial.draftId || null);
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!to.trim() || !subject.trim()) return;
    setBusy(true);
    try {
      if (draftId) {
        // Persist any edits to the draft, then send via the draft endpoint.
        await fetch(`/api/inboxes/${inboxId}/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim(),
            subject: subject.trim(),
            plainBody: body,
          }),
        });
        const r = await fetch(`/api/inboxes/${inboxId}/drafts/${draftId}/send`, {
          method: "POST",
        });
        const data = await r.json();
        if (data.error) {
          toast.error(data.error);
          setBusy(false);
          return;
        }
      } else if (initial.replyToMessageId && mode === "reply") {
        const r = await fetch(
          `/api/inboxes/${inboxId}/messages/${initial.replyToMessageId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plainBody: body }),
          },
        );
        const data = await r.json();
        if (data.error) {
          toast.error(data.error);
          setBusy(false);
          return;
        }
      } else {
        const r = await fetch(`/api/inboxes/${inboxId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim(),
            subject: subject.trim(),
            plainBody: body,
            verified,
          }),
        });
        const data = await r.json();
        if (data.error) {
          toast.error(data.error);
          setBusy(false);
          return;
        }
      }
      onSent();
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  async function saveDraft() {
    setBusy(true);
    try {
      if (draftId) {
        await fetch(`/api/inboxes/${inboxId}/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim() || null,
            subject: subject.trim() || null,
            plainBody: body,
          }),
        });
      } else {
        const r = await fetch(`/api/inboxes/${inboxId}/drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim() || null,
            subject: subject.trim() || null,
            plainBody: body,
            replyToMessageId: initial.replyToMessageId || null,
          }),
        });
        const data = await r.json();
        if (data.draft) setDraftId(data.draft.id);
      }
      onSavedDraft();
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  async function discard() {
    if (draftId) {
      if (!confirm("Discard this draft?")) return;
      await fetch(`/api/inboxes/${inboxId}/drafts/${draftId}`, { method: "DELETE" });
      onDraftDiscarded();
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <Card className="flex w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-semibold">
            {mode === "reply"
              ? "Reply"
              : mode === "draft"
                ? "Edit draft"
                : "New message"}
          </h2>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={mode === "reply"}
            />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              rows={10}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {mode === "new" ? (
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I&apos;ve verified the recipient address out-of-band (skip the deliverability
                guard). Required for sending to addresses that have never replied to this inbox.
              </span>
            </label>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={discard} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            {draftId ? "Discard draft" : "Cancel"}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={saveDraft}
              disabled={busy || (!to.trim() && !subject.trim() && !body.trim())}
            >
              <FilePen className="h-3.5 w-3.5" />
              Save draft
            </Button>
            <Button
              size="sm"
              onClick={send}
              disabled={busy || !to.trim() || !subject.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
