"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Trash2, Power } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Signal = {
  id: number;
  name: string;
  query: string;
  enabled: number;
  intervalMinutes: number;
  accountId: string | null;
  actionType: "linkedin_connect" | "linkedin_dm" | "email";
  messageTemplate: string | null;
  lastPolledAt: string | null;
  createdAt: string;
};

type Account = { id: string; label: string };

export default function SignalsPage() {
  const [signals, setSignals] = React.useState<Signal[]>([]);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const reload = React.useCallback(() => {
    fetch("/api/signals").then((r) => r.json()).then((d) => setSignals(d.signals || []));
    fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || []));
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function toggle(id: number, enabled: number) {
    await fetch(`/api/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: enabled === 0 }),
    });
    reload();
  }

  async function remove(id: number) {
    if (!confirm("Delete this signal? Matches will be lost.")) return;
    await fetch(`/api/signals/${id}`, { method: "DELETE" });
    toast.success("Signal deleted");
    reload();
  }

  async function runNow() {
    setRunning(true);
    try {
      const r = await fetch("/api/signals/run", { method: "POST" });
      const data = await r.json();
      const totalQueued = (data.summaries || []).reduce(
        (s: number, x: any) => s + (x.queued || 0),
        0,
      );
      toast.success(
        `Polled ${data.summaries?.length ?? 0} signal(s) — ${totalQueued} action(s) queued. Check the queue.`,
      );
      reload();
    } catch (err: any) {
      toast.error(err.message);
    }
    setRunning(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intent signals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keywords the agent watches on LinkedIn. Each new matching post is classified and queued.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runNow} disabled={running || signals.length === 0}>
            <Play className="h-4 w-4" /> {running ? "Running…" : "Run now"}
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> New signal
          </Button>
        </div>
      </div>

      {signals.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No signals yet. Create one to start watching LinkedIn.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{s.name}</h3>
                    <Badge variant={s.enabled ? "success" : "outline"}>
                      {s.enabled ? "Active" : "Paused"}
                    </Badge>
                    <Badge variant="outline">{s.actionType.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {`"${s.query}"`}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Polls every {s.intervalMinutes}m · Last: {fmtDate(s.lastPolledAt)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle(s.id, s.enabled)}
                    title={s.enabled ? "Pause" : "Resume"}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm ? (
        <NewSignalForm
          accounts={accounts}
          onDone={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}

function NewSignalForm({
  accounts,
  onDone,
  onCancel,
}: {
  accounts: Account[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [intervalMinutes, setIntervalMinutes] = React.useState(30);
  const [accountId, setAccountId] = React.useState<string>(accounts[0]?.id || "");
  const [actionType, setActionType] = React.useState<"linkedin_connect" | "linkedin_dm">(
    "linkedin_connect",
  );
  const [messageTemplate, setMessageTemplate] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const r = await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        query,
        intervalMinutes,
        accountId: accountId || null,
        actionType,
        messageTemplate: messageTemplate.trim() || null,
      }),
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Signal created");
      onDone();
    } else {
      toast.error("Failed to create");
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">New signal</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="space-y-3">
        <Field id="name" label="Name" hint="What you'd call this in your team chat.">
          <Input
            id="name"
            placeholder="e.g. Founders complaining about cold-email tooling"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="query" label="LinkedIn search query" hint="Keyword(s) to match in posts.">
          <Input
            id="query"
            placeholder='e.g. "outbound is broken"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="interval" label="Poll every (minutes)">
            <Input
              id="interval"
              type="number"
              value={intervalMinutes}
              min={5}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            />
          </Field>
          <Field id="account" label="LinkedIn account">
            <select
              id="account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">First active account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="action" label="Action when matched">
          <select
            id="action"
            value={actionType}
            onChange={(e) => setActionType(e.target.value as any)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="linkedin_connect">Send connection request</option>
            <option value="linkedin_dm">Send direct message</option>
          </select>
        </Field>
        <Field
          id="template"
          label="Message template (optional)"
          hint="Leave blank to let the agent draft a personalized note per match. Otherwise this exact text is sent every time."
        >
          <Textarea
            id="template"
            rows={3}
            placeholder="Hi {{first_name}}, saw your post about…"
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
          />
        </Field>
        <Button onClick={submit} disabled={busy || !name || !query}>
          {busy ? "Creating…" : "Create signal"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
