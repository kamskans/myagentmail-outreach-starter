"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Check, X, Pencil } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Action = {
  id: number;
  type: string;
  payload: any;
  reasoning: string;
  status: "pending" | "approved" | "sent" | "rejected" | "failed";
  result: string | null;
  createdAt: string;
  signalName: string | null;
  postUrl: string | null;
  postExcerpt: string | null;
  authorName: string | null;
  authorHeadline: string | null;
};

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "sent", label: "Sent" },
  { id: "rejected", label: "Rejected" },
  { id: "failed", label: "Failed" },
] as const;

export default function QueuePage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("pending");
  const [actions, setActions] = React.useState<Action[]>([]);
  const reload = React.useCallback(() => {
    fetch(`/api/queue?status=${tab}`)
      .then((r) => r.json())
      .then((d) => setActions(d.actions || []));
  }, [tab]);
  React.useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the agent&apos;s drafts before anything sends. Edit the message inline if you want
          to change the tone.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "border-b-2 border-primary pb-2 text-sm font-medium"
                : "pb-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {actions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No {tab} actions.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action, onChanged }: { action: Action; onChanged: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [message, setMessage] = React.useState(action.payload.message || "");
  const [busy, setBusy] = React.useState(false);

  async function approve() {
    setBusy(true);
    if (editing) {
      await fetch(`/api/queue/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    }
    const r = await fetch(`/api/queue/${action.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const data = await r.json();
    if (data.ok) toast.success("Sent");
    else toast.error(data.error || "Failed");
    setBusy(false);
    onChanged();
  }
  async function reject() {
    setBusy(true);
    await fetch(`/api/queue/${action.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    setBusy(false);
    onChanged();
  }

  const status = action.status;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{action.authorName || "Unknown author"}</h3>
            <Badge variant="outline">{action.type.replace("_", " ")}</Badge>
            <Badge
              variant={
                status === "sent"
                  ? "success"
                  : status === "rejected" || status === "failed"
                    ? "destructive"
                    : "outline"
              }
            >
              {status}
            </Badge>
          </div>
          {action.authorHeadline ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{action.authorHeadline}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            From signal: <span className="font-medium">{action.signalName || "—"}</span> ·{" "}
            {fmtDate(action.createdAt)}
          </p>
        </div>
        {action.postUrl ? (
          <a
            href={action.postUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View post →
          </a>
        ) : null}
      </div>

      {action.postExcerpt ? (
        <blockquote className="mb-3 rounded-md border-l-2 border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {action.postExcerpt}
        </blockquote>
      ) : null}

      <div className="rounded-md border bg-background p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Draft message
          </span>
          {status === "pending" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="h-3 w-3" />
              {editing ? "Done" : "Edit"}
            </Button>
          ) : null}
        </div>
        {editing ? (
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{message}</p>
        )}
      </div>

      {action.reasoning ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <strong className="text-foreground">Why:</strong> {action.reasoning}
        </p>
      ) : null}

      {action.result && (status === "sent" || status === "failed") ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          <strong className="text-foreground">Result:</strong> {action.result}
        </p>
      ) : null}

      {status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={approve} disabled={busy}>
            <Check className="h-4 w-4" /> Approve & send
          </Button>
          <Button variant="outline" onClick={reject} disabled={busy}>
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
