"use client";

/**
 * Unified mail client — tenant-wide 3-pane view.
 *
 * Layout, modeled on Cloudflare's agentic-inbox:
 *   ┌────────────┬─────────────────┬───────────────────────────┐
 *   │  Folders   │  Message list   │  Reading pane             │
 *   │ (180px)    │  (380px when    │  (flex-1, hidden when no  │
 *   │            │   reading,      │   selection)              │
 *   │            │   else flex-1)  │                           │
 *   └────────────┴─────────────────┴───────────────────────────┘
 *
 * Data:
 *   GET /api/myagentmail/messages?folder=...&group=thread → list
 *   GET /api/myagentmail/messages/folders/counts          → sidebar badges
 *   GET /api/myagentmail/inboxes/:id/threads/:tid         → thread detail
 *
 * Stage 2 is read-only (this file). Stage 3 adds star / mark-read /
 * archive / delete via PATCH /inboxes/:id/messages/:mid + DELETE, plus
 * a reply pane that POSTs to /inboxes/:id/reply/:mid.
 *
 * Why a single file? The whole client is ~600 LOC even with three
 * panes; splitting earns nothing and forces prop drilling for the
 * selected-message + folder state. We split when this grows useful
 * sub-trees.
 */

import * as React from "react";
import {
  Inbox as InboxIcon,
  Send,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Mail,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type Folder = "inbox" | "sent" | "starred" | "archived" | "trash";

type MessageRow = {
  id: string;
  inboxId: string;
  inboxUsername: string;
  inboxDomain: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  receivedAt: string;
  threadId: string | null;
  threadCount?: number;
  threadUnreadCount?: number;
};

type FolderCounts = {
  inbox: { unread: number; total: number };
  sent: { total: number };
  starred: { total: number };
  archived: { total: number };
  trash: { total: number };
};

type ThreadDetail = {
  thread: { id: string; messageCount: number };
  messages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    from: string;
    to: string;
    subject: string;
    plainBody: string | null;
    htmlBody: string | null;
    receivedAt: string;
    isRead: boolean;
  }>;
};

const FOLDER_DEFS: Array<{
  id: Folder;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archived", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function fmtListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function localPart(addr: string): string {
  return (addr || "").split("@")[0] || addr || "";
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function MailPage() {
  const [folder, setFolder] = React.useState<Folder>("inbox");
  const [counts, setCounts] = React.useState<FolderCounts | null>(null);
  const [messages, setMessages] = React.useState<MessageRow[] | null>(null);
  const [selected, setSelected] = React.useState<MessageRow | null>(null);
  const [thread, setThread] = React.useState<ThreadDetail | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [threadLoading, setThreadLoading] = React.useState(false);

  const loadCounts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/myagentmail/messages/folders/counts");
      const json = await res.json();
      if (res.ok) setCounts(json);
    } catch {
      /* badges are best-effort */
    }
  }, []);

  const loadMessages = React.useCallback(async (f: Folder) => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/myagentmail/messages?folder=${f}&group=thread&limit=50`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setMessages(json.messages || []);
    } catch (err: any) {
      toast.error(`Failed to load mail: ${err?.message ?? err}`);
      setMessages([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadCounts();
    loadMessages(folder);
    // Selection doesn't carry between folders.
    setSelected(null);
    setThread(null);
  }, [folder, loadMessages, loadCounts]);

  const openMessage = React.useCallback(async (m: MessageRow) => {
    setSelected(m);
    setThread(null);
    if (!m.threadId) return;
    setThreadLoading(true);
    try {
      const res = await fetch(
        `/api/myagentmail/inboxes/${m.inboxId}/threads/${m.threadId}`,
      );
      const json = await res.json();
      if (res.ok) setThread(json);
    } catch {
      /* fall back to single-message snippet */
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const closeReader = React.useCallback(() => {
    setSelected(null);
    setThread(null);
  }, []);

  const isReaderOpen = selected !== null;

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-3 -my-3">
      <FolderRail
        folder={folder}
        counts={counts}
        onSelect={(f) => setFolder(f)}
      />
      <div className="flex-1 flex min-w-0 rounded-lg border bg-background overflow-hidden">
        <MessageList
          folder={folder}
          messages={messages}
          selectedId={selected?.id ?? null}
          refreshing={refreshing}
          collapsed={isReaderOpen}
          onSelect={openMessage}
          onRefresh={() => {
            loadCounts();
            loadMessages(folder);
          }}
        />
        {isReaderOpen && (
          <ReadingPane
            message={selected!}
            thread={thread}
            loading={threadLoading}
            onBack={closeReader}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Folder rail (left, 200px)
// ─────────────────────────────────────────────────────────────────────

function FolderRail({
  folder,
  counts,
  onSelect,
}: {
  folder: Folder;
  counts: FolderCounts | null;
  onSelect: (f: Folder) => void;
}) {
  const badge = (id: Folder): number | null => {
    if (!counts) return null;
    if (id === "inbox") return counts.inbox.unread || null;
    if (id === "starred") return counts.starred.total || null;
    if (id === "archived") return counts.archived.total || null;
    if (id === "trash") return counts.trash.total || null;
    return null;
  };
  return (
    <aside className="w-44 shrink-0 hidden md:flex md:flex-col">
      <ul className="space-y-0.5">
        {FOLDER_DEFS.map((f) => {
          const active = folder === f.id;
          const Icon = f.icon;
          const count = badge(f.id);
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{f.label}</span>
                {count != null ? (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Message list (middle, 380px when reading pane open, else flex-1)
// ─────────────────────────────────────────────────────────────────────

function MessageList({
  folder,
  messages,
  selectedId,
  refreshing,
  collapsed,
  onSelect,
  onRefresh,
}: {
  folder: Folder;
  messages: MessageRow[] | null;
  selectedId: string | null;
  refreshing: boolean;
  collapsed: boolean;
  onSelect: (m: MessageRow) => void;
  onRefresh: () => void;
}) {
  const folderLabel = FOLDER_DEFS.find((f) => f.id === folder)?.label ?? "Mail";

  return (
    <div
      className={cn(
        "flex flex-col min-w-0 shrink-0",
        collapsed
          ? "hidden md:flex md:w-[380px] md:border-r"
          : "w-full",
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <h1 className="text-base font-semibold">{folderLabel}</h1>
        <div className="flex items-center gap-2">
          {messages && messages.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {messages.length} {messages.length === 1 ? "thread" : "threads"}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                refreshing && "animate-spin",
              )}
            />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages == null ? (
          <ListSkeleton />
        ) : messages.length === 0 ? (
          <EmptyFolder folder={folder} />
        ) : (
          <ul>
            {messages.map((m) => (
              <MessageRowItem
                key={m.id}
                message={m}
                selected={selectedId === m.id}
                onClick={() => onSelect(m)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MessageRowItem({
  message,
  selected,
  onClick,
}: {
  message: MessageRow;
  selected: boolean;
  onClick: () => void;
}) {
  const unread =
    message.threadUnreadCount != null
      ? message.threadUnreadCount > 0
      : !message.isRead;
  const participant =
    message.direction === "outbound"
      ? `To: ${localPart(message.to)}`
      : localPart(message.from);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group w-full flex items-start gap-2.5 px-3 py-2.5 border-b text-left transition-colors",
          selected ? "bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <div className="w-2 mt-1.5 shrink-0 flex justify-center">
          {unread && <span className="h-2 w-2 rounded-full bg-primary" />}
        </div>
        <Star
          className={cn(
            "h-3.5 w-3.5 mt-0.5 shrink-0",
            message.isStarred
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                unread ? "font-semibold" : "font-medium text-foreground/90",
              )}
            >
              {participant}
            </span>
            {(message.threadCount ?? 1) > 1 && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">
                {message.threadCount}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {fmtListDate(message.receivedAt)}
            </span>
          </div>
          <div className="truncate text-sm mt-0.5">
            <span className={unread ? "font-medium" : "text-muted-foreground"}>
              {message.subject || "(no subject)"}
            </span>
            {message.snippet && (
              <span className="text-muted-foreground font-normal">
                {" "}— {message.snippet}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">
            {message.inboxUsername}@{message.inboxDomain}
          </div>
        </div>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-2.5 px-3 py-3 border-b">
          <div className="w-2 h-2 rounded-full bg-muted mt-1.5" />
          <div className="w-3.5 h-3.5 rounded-sm bg-muted mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-3 flex-1 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
            <div className="h-2.5 w-3/4 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyFolder({ folder }: { folder: Folder }) {
  const copy: Record<Folder, { title: string; sub: string }> = {
    inbox: { title: "Inbox is empty", sub: "New mail across all your inboxes will appear here." },
    sent: { title: "No sent mail", sub: "Outbound messages from any of your inboxes show up here." },
    starred: { title: "No starred mail", sub: "Star a thread from the inbox view to keep it pinned here." },
    archived: { title: "Archive is empty", sub: "Archive mail to move it out of the inbox without deleting." },
    trash: { title: "Trash is empty", sub: "Deleted mail lives here for now (soft delete)." },
  };
  const c = copy[folder];
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <Mail className="h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 font-medium">{c.title}</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">{c.sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reading pane (right, flex-1)
// ─────────────────────────────────────────────────────────────────────

function ReadingPane({
  message,
  thread,
  loading,
  onBack,
}: {
  message: MessageRow;
  thread: ThreadDetail | null;
  loading: boolean;
  onBack: () => void;
}) {
  const messages = thread?.messages || null;
  const sorted = React.useMemo(() => {
    if (!messages) return null;
    return [...messages].sort(
      (a, b) =>
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    );
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold truncate flex-1">
          {message.subject || "(no subject)"}
        </h2>
        {(message.threadCount ?? 1) > 1 && (
          <Badge variant="outline" className="shrink-0">
            {message.threadCount} messages
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !sorted ? (
          <ReaderSkeleton />
        ) : sorted && sorted.length > 0 ? (
          <ul className="divide-y">
            {sorted.map((msg, idx) => (
              <MessageBlock
                key={msg.id}
                msg={msg}
                defaultOpen={idx === sorted.length - 1}
              />
            ))}
          </ul>
        ) : (
          // Single-message fallback if thread fetch failed or thread has 1 msg
          <SingleMessageFallback message={message} />
        )}
      </div>
    </div>
  );
}

function MessageBlock({
  msg,
  defaultOpen,
}: {
  msg: ThreadDetail["messages"][number];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const sender = localPart(msg.from);
  const time = new Date(msg.receivedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-3 hover:bg-muted/30"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{sender}</span>
          <span className="text-xs text-muted-foreground truncate">
            &lt;{msg.from}&gt;
          </span>
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {time}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          To: {msg.to}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5">
          <MessageBody msg={msg} />
        </div>
      )}
    </li>
  );
}

function MessageBody({ msg }: { msg: ThreadDetail["messages"][number] }) {
  // Plain-text first — safer than rendering remote HTML in-page. We can
  // upgrade to a sandboxed iframe (like agentic-inbox's EmailIframe)
  // when we add HTML rendering as a feature.
  if (msg.plainBody && msg.plainBody.trim()) {
    return (
      <pre className="whitespace-pre-wrap text-sm font-sans text-foreground/90 leading-relaxed">
        {msg.plainBody}
      </pre>
    );
  }
  if (msg.htmlBody && msg.htmlBody.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic">
        (HTML body — plain-text not available. Open the inbox detail page for
        full rendering.)
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground italic">(empty body)</p>
  );
}

function SingleMessageFallback({ message }: { message: MessageRow }) {
  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="font-medium text-sm">{localPart(message.from)}</span>
        <span className="text-xs text-muted-foreground truncate">
          &lt;{message.from}&gt;
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(message.receivedAt).toLocaleString()}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">To: {message.to}</div>
      <pre className="whitespace-pre-wrap text-sm font-sans text-foreground/90 leading-relaxed pt-2">
        {message.snippet || "(no preview available)"}
      </pre>
      <p className="text-xs text-muted-foreground italic pt-2">
        Showing snippet only. The thread fetch returned no messages — this can
        happen for very recent inbound mail before it&apos;s fully indexed.
      </p>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="animate-pulse p-5 space-y-4">
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="space-y-2 pt-3">
        <div className="h-2.5 w-full rounded bg-muted" />
        <div className="h-2.5 w-5/6 rounded bg-muted" />
        <div className="h-2.5 w-4/6 rounded bg-muted" />
        <div className="h-2.5 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}
