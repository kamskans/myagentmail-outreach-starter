"use client";

/**
 * Cadences index — list every cadence in the tenant + a "New cadence"
 * shortcut. Powered by the read side of the mamProxyHandler whitelist
 * (GET /v1/cadences).
 *
 * The actual editor lives at /cadences/[id] (or /cadences/new) and
 * renders the <CadenceBuilder /> widget from @myagentmail/react.
 *
 * If you'd rather not use our cadence engine, you can ignore this whole
 * page — see the README's "Build your own cadence engine" section. The
 * raw send + webhook primitives stay available regardless.
 */

import * as React from "react";
import Link from "next/link";
import { Plus, Loader2, Workflow, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

type Cadence = {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  dailySendCap?: number | null;
  createdAt: string;
  stepsCount?: number;
};

export default function CadencesPage() {
  const [items, setItems] = React.useState<Cadence[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/myagentmail/cadences");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setItems(json.items || json.cadences || []);
      } catch (err: any) {
        if (!cancelled) {
          toast.error(`Failed to load cadences: ${err?.message ?? err}`);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cadences</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Multi-step outreach sequences (LinkedIn invite → wait → DM → email
            → ...). MyAgentMail runs the cron, branch logic, throttling, and
            business-hours guard server-side. Webhooks fire on every step,
            reply, and completion — wire them up in <code>/api/webhook</code>.
          </p>
        </div>
        <Link href="/cadences/new">
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New cadence
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
          <p className="mt-3 font-medium">No cadences yet</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Build your first sequence — invite a lead on LinkedIn, wait three
            days, follow up with an email if they haven&apos;t replied. Save it,
            then enroll leads via <code>POST /v1/cadences/:id/enrollments</code>.
          </p>
          <Link href="/cadences/new" className="inline-block mt-4">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              New cadence
            </Button>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-2">
          {(items || []).map((c) => (
            <li key={c.id}>
              <Link href={`/cadences/${c.id}`}>
                <Card className="p-4 hover:border-primary/40 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      <Badge variant={c.status === "active" ? "success" : "outline"}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {fmtDate(c.createdAt)}
                      {c.dailySendCap ? ` • cap ${c.dailySendCap}/day` : ""}
                      {typeof c.stepsCount === "number" ? ` • ${c.stepsCount} steps` : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
