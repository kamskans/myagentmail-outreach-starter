"use client";

/**
 * Signal detail — shows the agent's config and every match it has ever
 * surfaced for this signal, newest first. The "Run now" button at the
 * top forces an immediate poll and refreshes the matches list inline so
 * the user can SEE what the agent just caught (instead of just reading
 * a toast that says "3 new matches").
 */

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  filterMinIntent: Intent;
  intentDescription: string;
  enabled: boolean;
  lastPolledAt: string | null;
  nextPollAt: string | null;
  lastError: string | null;
  matchesCount: number;
  createdAt: string;
};

type Match = {
  id: string;
  postUrl: string;
  postExcerpt: string | null;
  postPostedAt: string | null;
  author: {
    name: string | null;
    profileUrl: string | null;
    headline: string | null;
    role: string | null;
    company: string | null;
  };
  classification: { engage: boolean; intent: Intent; reason: string } | null;
  triageScore: number | null;
  pendingEnrichment: boolean;
  foundAt: string;
};

type RunResult = {
  ok: boolean;
  fetched: number;
  newMatches: number;
  webhooksQueued: number;
  errorCode?: string;
  errorMessage?: string;
};

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Once a day",
  every_12h: "Every 12 hours",
  every_6h: "Every 6 hours",
  manual: "Manual only",
};

export default function SignalDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params?.id;
  const autoRun = search?.get("run") === "1";

  const [signal, setSignal] = React.useState<ManagedSignal | null>(null);
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [lastRun, setLastRun] = React.useState<RunResult | null>(null);

  const reload = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [signalsR, matchesR] = await Promise.all([
      fetch("/api/managed-signals").then((r) => r.json()),
      fetch(`/api/managed-signals/${id}/matches?limit=100`).then((r) => r.json()),
    ]);
    setSignal((signalsR.signals || []).find((s: ManagedSignal) => s.id === id) || null);
    setMatches(matchesR.matches || []);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // Auto-run on first mount when arriving from "Run now" on the list page.
  // Strip the query so a refresh doesn't re-run.
  const didAutoRunRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoRun || didAutoRunRef.current || !id) return;
    didAutoRunRef.current = true;
    runNow();
    router.replace(`/managed-signals/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, id]);

  async function runNow() {
    if (!id) return;
    setRunning(true);
    setLastRun(null);
    const r = await fetch(`/api/managed-signals/${id}`, { method: "POST" });
    const data = await r.json();
    setRunning(false);
    const result: RunResult = data.result;
    setLastRun(result);
    if (result?.ok) {
      toast.success(
        result.newMatches > 0
          ? `Found ${result.newMatches} new match(es)`
          : `No new matches in the past 24h`,
      );
      reload();
    } else {
      toast.error(result?.errorMessage || data.error || "Run failed");
    }
  }

  async function remove() {
    if (!signal) return;
    if (!confirm(`Delete "${signal.name}"? Future polls and webhook deliveries stop immediately.`))
      return;
    await fetch(`/api/managed-signals/${signal.id}`, { method: "DELETE" });
    toast.success("Signal deleted");
    router.push("/managed-signals");
  }

  if (loading && !signal) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!signal) {
    return (
      <div className="space-y-3">
        <Link href="/managed-signals" className="text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          Back to signals
        </Link>
        <Card className="p-6 text-sm">
          Signal not found. It may have been deleted, or the LinkedIn add-on isn&apos;t enabled.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/managed-signals"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="mr-1 inline h-4 w-4" />
          All signals
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{signal.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{CADENCE_LABELS[signal.cadence]}</Badge>
            {signal.webhookUrl ? (
              <Badge variant="outline">Webhook ≥ {signal.filterMinIntent} intent</Badge>
            ) : (
              <Badge variant="outline">Pull only — no webhook</Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              Last polled {fmtDate(signal.lastPolledAt)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={runNow} disabled={running}>
            <Play className="h-4 w-4" />
            {running ? "Running…" : "Run now"}
          </Button>
          <Button variant="outline" onClick={reload} title="Refresh matches">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="text-destructive" onClick={remove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {lastRun ? (
        <Card
          className={
            lastRun.ok
              ? "border-emerald-500/30 bg-emerald-500/5 p-4"
              : "border-destructive/30 bg-destructive/5 p-4"
          }
        >
          <div className="flex items-start gap-3">
            {lastRun.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            )}
            <div className="flex-1 text-sm">
              {lastRun.ok ? (
                <>
                  <p className="font-medium">
                    Run complete — fetched {lastRun.fetched} post(s) in the past 24h
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {lastRun.newMatches > 0
                      ? `${lastRun.newMatches} new match(es) added below.${lastRun.webhooksQueued > 0 ? ` ${lastRun.webhooksQueued} webhook(s) queued.` : ""}`
                      : "Nothing new — every post we saw was already on file or didn't pass the firing rule."}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Run failed</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <strong>{lastRun.errorCode}:</strong> {lastRun.errorMessage}
                  </p>
                </>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setLastRun(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <details>
          <summary className="cursor-pointer border-b px-4 py-3 text-sm font-medium hover:bg-muted/40">
            Configuration
          </summary>
          <div className="space-y-3 p-4 text-sm">
            <Row label="Keyword">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{signal.query}</code>
            </Row>
            <Row label="Cadence">{CADENCE_LABELS[signal.cadence]}</Row>
            <Row label="Webhook filter">≥ {signal.filterMinIntent} intent</Row>
            <Row label="Webhook URL">
              {signal.webhookUrl ? (
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{signal.webhookUrl}</code>
              ) : (
                <span className="text-muted-foreground">— none —</span>
              )}
            </Row>
            <Row label="Created">{fmtDate(signal.createdAt)}</Row>
            <div className="border-t pt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Firing rule
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs">{signal.intentDescription}</p>
            </div>
          </div>
        </details>
      </Card>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">
            Matches{" "}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {matches.length} on file
            </span>
          </h2>
          {signal.lastError ? (
            <span className="text-[11px] text-amber-700">⚠ {signal.lastError}</span>
          ) : null}
        </div>
        <Card className="overflow-hidden">
          {matches.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No matches yet. Click <strong>Run now</strong> above to poll LinkedIn immediately,
              or wait for the next scheduled poll.
            </div>
          ) : (
            <ul className="divide-y">
              {matches.map((m) => (
                <li key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{m.author.name || "—"}</span>
                        {m.classification ? (
                          <Badge
                            variant={
                              m.classification.intent === "high"
                                ? "default"
                                : m.classification.intent === "medium"
                                  ? "warning"
                                  : "outline"
                            }
                          >
                            {m.classification.intent} intent
                          </Badge>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {fmtDate(m.foundAt)}
                        </span>
                      </div>
                      {m.author.role || m.author.company ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {[m.author.role, m.author.company].filter(Boolean).join(" · ")}
                        </p>
                      ) : m.author.headline ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {m.author.headline}
                        </p>
                      ) : null}
                      {m.pendingEnrichment ? (
                        <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                          ⏳ Pending enrichment — profile lookup deferred to next poll
                        </p>
                      ) : null}
                      <p className="mt-1.5 line-clamp-3 text-xs">
                        {m.postExcerpt || "(no excerpt)"}
                      </p>
                      {m.classification?.reason ? (
                        <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                          {m.classification.reason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <a
                        href={m.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        View post <ExternalLink className="h-3 w-3" />
                      </a>
                      {m.author.profileUrl ? (
                        <a
                          href={m.author.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted-foreground hover:text-primary"
                        >
                          Profile
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
