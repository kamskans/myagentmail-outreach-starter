"use client";

/**
 * Historical LinkedIn search — one-shot keyword lookups across past
 * 24h / week / month. Different mental model from /managed-signals
 * (recurring real-time watchers). Type a query, pick a window, see
 * the hit list inline. Past searches are persisted by MyAgentMail so
 * customers can re-open one without spending another LinkedIn quota.
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search as SearchIcon, History, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

type Lookback = "past-24h" | "past-week" | "past-month";
type Intent = "low" | "medium" | "high";

type Session = { id: string; label: string | null; status: string };

type SearchRow = {
  id: string;
  query: string;
  lookback: Lookback;
  minIntent: Intent | null;
  resultCount: number;
  tookMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type ResultRow = {
  postUrl: string;
  postExcerpt: string;
  postedAt: string | null;
  author: { name: string; profileUrl: string; headline: string | null };
  classification: { engage: boolean; intent: Intent; reason: string };
  rank: number;
};

const LOOKBACK_LABELS: Record<Lookback, string> = {
  "past-24h": "Past 24 hours",
  "past-week": "Past week",
  "past-month": "Past month",
};

export default function HistoricalSearchPage() {
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [history, setHistory] = React.useState<SearchRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [sessionId, setSessionId] = React.useState("");
  const [lookback, setLookback] = React.useState<Lookback>("past-week");
  const [minIntent, setMinIntent] = React.useState<Intent | "any">("any");

  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<ResultRow[] | null>(null);
  const [tookMs, setTookMs] = React.useState<number | null>(null);

  const reload = React.useCallback(() => {
    fetch("/api/historical-search")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setError(null);
        setHistory(d.searches || []);
        setSessions(d.sessions || []);
        if (!sessionId && d.sessions?.[0]) setSessionId(d.sessions[0].id);
      });
  }, [sessionId]);

  React.useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    if (!sessionId || !query.trim()) return;
    setBusy(true);
    setResults(null);
    setTookMs(null);
    const r = await fetch("/api/historical-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        query: query.trim(),
        lookback,
        minIntent: minIntent === "any" ? undefined : minIntent,
        limit: 50,
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setResults(data.results || []);
    setTookMs(data.search?.tookMs ?? null);
    toast.success(`Found ${data.results?.length ?? 0} match(es)`);
    reload();
  }

  async function rerunFromHistory(s: SearchRow) {
    setQuery(s.query);
    setLookback(s.lookback);
    setMinIntent(s.minIntent ?? "any");
    const r = await fetch(`/api/historical-search/${s.id}`);
    const data = await r.json();
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setResults(data.results || []);
    setTookMs(data.search?.tookMs ?? null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One-shot LinkedIn lookups across the past 24 hours, week, or month. For continuous
          monitoring use{" "}
          <Link href="/managed-signals" className="text-primary hover:underline">
            Intent signals
          </Link>
          .
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</Card>
      ) : null}

      {sessions.length === 0 && !error ? (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          You need at least one connected LinkedIn account.{" "}
          <Link href="/accounts" className="text-primary hover:underline">
            Connect an account →
          </Link>
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <Label>Search query</Label>
            <Input
              placeholder='e.g. "outbound is broken"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
          </div>
          <div className="md:col-span-3">
            <Label>LinkedIn account</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="" disabled>
                Pick an account
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Time period</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={lookback}
              onChange={(e) => setLookback(e.target.value as Lookback)}
            >
              <option value="past-24h">Past 24 hours</option>
              <option value="past-week">Past week</option>
              <option value="past-month">Past month</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Min intent</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={minIntent}
              onChange={(e) => setMinIntent(e.target.value as Intent | "any")}
            >
              <option value="any">Any</option>
              <option value="low">Low+</option>
              <option value="medium">Medium+</option>
              <option value="high">High only</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Each search uses one LinkedIn API call against the connected account.
          </p>
          <Button onClick={runSearch} disabled={busy || !query.trim() || !sessionId}>
            <SearchIcon className="h-4 w-4" />
            {busy ? "Searching…" : "Run search"}
          </Button>
        </div>
      </Card>

      {results !== null ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {results.length} result{results.length === 1 ? "" : "s"} for{" "}
              <span className="font-mono">&ldquo;{query}&rdquo;</span> ·{" "}
              {LOOKBACK_LABELS[lookback]}
            </span>
            {tookMs ? <span>{tookMs}ms</span> : null}
          </div>
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No matches in the chosen window. Try widening the time period.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Author
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Excerpt
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Intent
                  </th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.postUrl} className="border-b last:border-b-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.author.name || "—"}</div>
                      {r.author.profileUrl ? (
                        <a
                          href={r.author.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted-foreground hover:text-primary"
                        >
                          Profile
                        </a>
                      ) : null}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="line-clamp-3 text-xs">{r.postExcerpt || "(no excerpt)"}</p>
                      {r.classification.reason ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {r.classification.reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          r.classification.intent === "high"
                            ? "default"
                            : r.classification.intent === "medium"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {r.classification.intent}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={r.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open on LinkedIn"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      <div className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" />
        Recent searches
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Query
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Window
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Results
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Run at
              </th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  No past searches yet.
                </td>
              </tr>
            ) : (
              history.map((s) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs">&ldquo;{s.query}&rdquo;</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{LOOKBACK_LABELS[s.lookback]}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {s.errorCode ? (
                      <span className="text-amber-600">{s.errorCode}</span>
                    ) : (
                      s.resultCount
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(s.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => rerunFromHistory(s)}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
