"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Play, Webhook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

type Cadence = "daily" | "every_12h" | "every_6h" | "manual";
type Intent = "low" | "medium" | "high";

type ManagedSignal = {
  id: string;
  name: string;
  query: string;
  sessionId: string;
  cadence: Cadence;
  webhookUrl: string | null;
  webhookSecret: string | null;
  filterMinIntent: Intent;
  enabled: boolean;
  lastPolledAt: string | null;
  nextPollAt: string | null;
  lastError: string | null;
  matchesCount: number;
  createdAt: string;
};

type Session = { id: string; label: string | null; status: string };

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  every_12h: "Every 12 hours",
  every_6h: "Every 6 hours",
  manual: "Manual only",
};

export default function ManagedSignalsPage() {
  const [signals, setSignals] = React.useState<ManagedSignal[]>([]);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    fetch("/api/managed-signals")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setError(null);
        setSignals(d.signals || []);
        setSessions(d.sessions || []);
      });
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function remove(id: string) {
    if (!confirm("Delete this signal? Future polls and webhook deliveries stop immediately.")) return;
    await fetch(`/api/managed-signals/${id}`, { method: "DELETE" });
    toast.success("Signal deleted");
    reload();
  }
  async function runNow(id: string) {
    const r = await fetch(`/api/managed-signals/${id}`, { method: "POST" });
    const data = await r.json();
    if (data.result?.ok) {
      toast.success(`Polled — ${data.result.newMatches} new match(es), ${data.result.webhooksQueued} webhook(s) queued`);
    } else {
      toast.error(data.result?.errorMessage || data.error || "Run failed");
    }
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intent signals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Managed by MyAgentMail. We poll LinkedIn on the chosen cadence and POST high-intent
            matches to <code className="rounded bg-muted px-1">/api/webhook</code>.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={sessions.length === 0}>
          <Plus className="h-4 w-4" /> New signal
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>API error:</strong> {error}
          <p className="mt-1 text-xs text-muted-foreground">
            Make sure <code>MYAGENTMAIL_API_KEY</code> is set, and that your tenant has the LinkedIn
            add-on enabled.
          </p>
        </Card>
      ) : null}

      {sessions.length === 0 && !error ? (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          You need at least one LinkedIn session before creating a signal. Add one at{" "}
          <a href="/accounts" className="text-primary hover:underline">
            LinkedIn accounts
          </a>
          .
        </Card>
      ) : null}

      {newSecret ? (
        <Card className="border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-medium text-emerald-700">Webhook secret created — save it now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set this as <code className="rounded bg-muted px-1">MYAGENTMAIL_WEBHOOK_SECRET</code> in
            your <code>.env</code> so signature verification works on incoming payloads.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <code className="break-all text-sm">{newSecret}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(newSecret);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setNewSecret(null)}>
            Dismiss
          </Button>
        </Card>
      ) : null}

      {signals.length === 0 ? (
        <Card className="p-8 text-center">
          <Webhook className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            No signals yet. Create one — MyAgentMail starts polling within minutes and POSTs to
            your webhook.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{s.name}</h3>
                    <Badge>{CADENCE_LABELS[s.cadence]}</Badge>
                    {s.webhookUrl ? (
                      <Badge variant="outline">≥ {s.filterMinIntent} intent</Badge>
                    ) : (
                      <Badge variant="outline">Pull only</Badge>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">&ldquo;{s.query}&rdquo;</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.matchesCount} matches · last polled {fmtDate(s.lastPolledAt)}
                  </p>
                  {s.lastError ? (
                    <p className="mt-2 text-[11px] text-amber-700">⚠ {s.lastError}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => runNow(s.id)} title="Run now">
                    <Play className="h-4 w-4" />
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
          sessions={sessions}
          onDone={(secret) => {
            setShowForm(false);
            if (secret) setNewSecret(secret);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}

function NewSignalForm({
  sessions,
  onDone,
  onCancel,
}: {
  sessions: Session[];
  onDone: (newSecret?: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id || "");
  const [cadence, setCadence] = React.useState<Cadence>("daily");
  const [filterMinIntent, setFilterMinIntent] = React.useState<Intent>("medium");
  const [intentDescription, setIntentDescription] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState(
    typeof window === "undefined" ? "" : `${window.location.origin}/api/webhook`,
  );
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const r = await fetch("/api/managed-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        query,
        sessionId,
        cadence,
        webhookUrl: webhookUrl.trim() || undefined,
        filterMinIntent,
        intentDescription: intentDescription.trim() || undefined,
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (data.signal) {
      toast.success("Signal created");
      onDone(data.signal.webhookSecret ?? null);
    } else {
      toast.error(data.error || "Failed");
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">New managed signal</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="space-y-3">
        <Field id="name" label="Name">
          <Input
            id="name"
            placeholder="Founders complaining about cold email"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="query" label="LinkedIn search keyword">
          <Input
            id="query"
            placeholder='"outbound is broken"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field id="rule" label="Firing rule (optional)">
          <textarea
            id="rule"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="e.g. Flag as ready when the author is a founder/operator complaining about cold email — skip vendors selling outbound tools, agencies, and content marketers."
            value={intentDescription}
            onChange={(e) => setIntentDescription(e.target.value)}
            maxLength={2000}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Plain English. The classifier treats this as authoritative — the keyword is just a coarse pre-filter. Leave blank for default scoring.
          </p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="session" label="LinkedIn account">
            <select
              id="session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="cadence" label="Cadence">
            <select
              id="cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="daily">Daily (recommended)</option>
              <option value="every_12h">Every 12 hours</option>
              <option value="every_6h">Every 6 hours</option>
              <option value="manual">Manual only</option>
            </select>
          </Field>
        </div>
        <Field id="webhook" label="Webhook URL">
          <Input
            id="webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-app.com/api/webhook"
          />
        </Field>
        {webhookUrl ? (
          <Field id="filter" label="Webhook filter — minimum intent">
            <select
              id="filter"
              value={filterMinIntent}
              onChange={(e) => setFilterMinIntent(e.target.value as Intent)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="high">High intent only (most strict)</option>
              <option value="medium">Medium and above (recommended)</option>
              <option value="low">All matches</option>
            </select>
          </Field>
        ) : null}
        <Button onClick={submit} disabled={busy || !name || !query || !sessionId}>
          {busy ? "Creating…" : "Create signal"}
        </Button>
      </div>
    </Card>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
