"use client";

/**
 * Sequences index — list every sequence in the tenant + a "New
 * sequence" shortcut. Powered by the read side of the mamProxyHandler
 * whitelist (GET /v1/cadences). The API resource is still called
 * `cadences` internally — we just relabel for the user.
 *
 * Each row gets an inline pause/resume control that PATCHes
 * `enabled: boolean` on /v1/cadences/:id. The runner skips
 * enrollments whose parent cadence has `enabled = false`, so
 * pausing takes effect within one cron tick (~5 min).
 *
 * If you'd rather not use the managed engine, ignore this whole page
 * — see the README's "Build your own engine" section. The raw send +
 * webhook primitives stay available regardless.
 */

import * as React from "react";
import Link from "next/link";
import { Plus, Loader2, Workflow, ArrowRight, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

type Sequence = {
  id: string;
  name: string;
  enabled: boolean;
  dailySendCap?: number | null;
  createdAt: string;
  stepsCount?: number;
};

export default function SequencesPage() {
  const [items, setItems] = React.useState<Sequence[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/myagentmail/cadences");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const list: any[] = json.items || json.cadences || [];
      setItems(
        list.map((c) => ({
          id: c.id,
          name: c.name,
          enabled: typeof c.enabled === "boolean" ? c.enabled : true,
          dailySendCap: c.dailySendCap ?? c.daily_send_cap ?? null,
          createdAt: c.createdAt ?? c.created_at,
          stepsCount: c.stepsCount ?? c.steps_count,
        })),
      );
    } catch (err: any) {
      toast.error(`Failed to load sequences: ${err?.message ?? err}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggle(seq: Sequence) {
    setBusyId(seq.id);
    try {
      const next = !seq.enabled;
      const res = await fetch(`/api/myagentmail/cadences/${seq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems((cur) =>
        (cur || []).map((c) => (c.id === seq.id ? { ...c, enabled: next } : c)),
      );
      toast.success(next ? "Sequence resumed" : "Sequence paused");
    } catch (err: any) {
      toast.error(`Failed to update: ${err?.message ?? err}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sequences</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Multi-step outreach (LinkedIn invite → wait → DM → email → ...).
            MyAgentMail runs the cron, branch logic, throttling, and
            business-hours guard server-side. Pause anytime with one click;
            the runner picks up the change within a few minutes. Webhooks
            fire on every step, reply, and completion — wire them up in{" "}
            <code>/api/webhook</code>.
          </p>
        </div>
        <Link href="/sequences/new">
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New sequence
          </Button>
        </Link>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items && items.length === 0 ? (
        <Card className="p-8 text-center">
          <Workflow className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">No sequences yet</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Build your first sequence — invite a lead on LinkedIn, wait three
            days, follow up with an email if they haven&apos;t replied. Save
            it, then enroll leads via{" "}
            <code>POST /v1/cadences/:id/enrollments</code>.
          </p>
          <Link href="/sequences/new" className="inline-block mt-4">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              New sequence
            </Button>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-2">
          {(items || []).map((c) => (
            <li key={c.id}>
              <Card className="p-4 hover:border-primary/40 transition-colors flex items-center justify-between gap-4">
                <Link href={`/sequences/${c.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{c.name}</span>
                    <Badge variant={c.enabled ? "success" : "outline"}>
                      {c.enabled ? "active" : "paused"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {fmtDate(c.createdAt)}
                    {c.dailySendCap ? ` • cap ${c.dailySendCap}/day` : ""}
                    {typeof c.stepsCount === "number"
                      ? ` • ${c.stepsCount} steps`
                      : ""}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(c);
                    }}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : c.enabled ? (
                      <>
                        <Pause className="h-3.5 w-3.5 mr-1.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Resume
                      </>
                    )}
                  </Button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
