"use client";

/**
 * LinkedIn account management — uses the @myagentmail/react widget
 * for the connect flow. Local SQLite mirrors the connected sessionIds
 * so the table can render without round-tripping to MyAgentMail every
 * page load.
 */

import * as React from "react";
import { toast } from "sonner";
import { LinkedInConnect } from "@myagentmail/react";
import "@myagentmail/react/styles.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Account = {
  id: string;
  label: string;
  sessionId: string;
  status: string;
  remoteStatus: string;
  createdAt: string;
};

type Utilization = {
  sessionId: string;
  label: string | null;
  status: string;
  rateLimitedUntil: string | null;
  rateLimitReason: string | null;
  counts: Record<string, number>;
  remaining: Record<string, number>;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [util, setUtil] = React.useState<{
    budget: Record<string, number>;
    sessions: Utilization[];
  } | null>(null);
  const [showWidget, setShowWidget] = React.useState(false);

  const reload = React.useCallback(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []));
    fetch("/api/accounts/utilization")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setUtil(null);
        } else {
          setUtil({ budget: d.budget || {}, sessions: d.sessions || [] });
        }
      })
      .catch(() => setUtil(null));
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function remove(id: string) {
    if (!confirm("Disconnect this LinkedIn account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    toast.success("Disconnected");
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect one or more LinkedIn accounts. Signals and searches auto-distribute polling
            across every connected account by default — every additional account multiplies your
            daily LinkedIn quota and protects each account from rate limits.
          </p>
        </div>
        <Button onClick={() => setShowWidget(true)}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Label
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No accounts yet. Add one to start watching LinkedIn for signals.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{a.label}</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.remoteStatus === "active" ? "success" : "warning"}>
                      {a.remoteStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {fmtDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {util && util.sessions.length > 0 ? (
        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Today&apos;s utilization</h2>
            <p className="text-[11px] text-muted-foreground">
              Per-session quota in the trailing 24h
            </p>
          </div>
          <div className="space-y-3">
            {util.sessions.map((u) => (
              <UtilTile key={u.sessionId} u={u} budget={util.budget} />
            ))}
          </div>
          {util.sessions.length === 1 ? (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              You&apos;re running on a single LinkedIn account. Connect a second account to double
              your daily quota and reduce the risk of any single account hitting LinkedIn&apos;s
              rate limits.
            </div>
          ) : null}
        </Card>
      ) : null}

      {showWidget ? (
        <div className="flex justify-center">
          <LinkedInConnect
            proxyUrl="/api/myagentmail/linkedin"
            onConnected={async ({ sessionId, label }) => {
              // Mirror the connection into the local SQLite so the
              // table renders without a round-trip to MyAgentMail.
              await fetch("/api/accounts/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, label }),
              });
              toast.success("Account connected");
              setShowWidget(false);
              reload();
            }}
            onCancel={() => setShowWidget(false)}
            onError={(err) => toast.error(err.message)}
          />
        </div>
      ) : null}
    </div>
  );
}

function UtilTile({ u, budget }: { u: Utilization; budget: Record<string, number> }) {
  const isLimited = u.rateLimitedUntil && new Date(u.rateLimitedUntil) > new Date();
  const actions: Array<{ key: string; label: string }> = [
    { key: "search_signal", label: "Signal polls" },
    { key: "search_history", label: "Searches" },
    { key: "profile_lookup", label: "Profile lookups" },
  ];
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{u.label || u.sessionId.slice(0, 8)}</span>
        {isLimited ? (
          <Badge variant="warning">Rate-limited</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {actions.map((a) => {
          const used = u.counts[a.key] ?? 0;
          const total = budget[a.key] ?? 0;
          const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
          const tone =
            pct < 60 ? "bg-emerald-500" : pct < 85 ? "bg-amber-500" : "bg-rose-500";
          return (
            <div key={a.key}>
              <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                <span>{a.label}</span>
                <span className="font-mono">
                  {used}/{total}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {isLimited && u.rateLimitReason ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ {u.rateLimitReason}
        </p>
      ) : null}
    </div>
  );
}
