"use client";

/**
 * Guided onboarding — Gojiberry-style multi-step wizard that walks the
 * user from "I have a MyAgentMail account" to "my AI agent is watching
 * LinkedIn for buyers" in five steps:
 *
 *   1. Connect LinkedIn      — widget OR pick existing session
 *   2. Define your ICP       — plain-English firing rule
 *   3. Choose precision      — Discovery / Balanced / High Precision
 *   4. Preview matches       — historical search seed (past month)
 *   5. Launch                — POST /v1/linkedin/signals + redirect
 *
 * Once finished, the agent starts polling on the chosen cadence and
 * matches arrive via the local /api/webhook route. Re-visiting this
 * page lets the user create another signal without re-doing step 1.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LinkedInConnect } from "@myagentmail/react";
import "@myagentmail/react/styles.css";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Linkedin,
  Search as SearchIcon,
  Sparkles,
  Target,
  Lightbulb,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Session = { id: string; label: string | null; status: string };
type Lookback = "past-24h" | "past-week" | "past-month";
type Intent = "low" | "medium" | "high";
type Precision = "discovery" | "balanced" | "high";

type ResultRow = {
  postUrl: string;
  postExcerpt: string;
  author: { name: string; profileUrl: string };
  classification: { engage: boolean; intent: Intent; reason: string };
};

const STEPS = [
  { id: "linkedin", label: "Connect LinkedIn" },
  { id: "icp", label: "Define ICP" },
  { id: "precision", label: "Choose precision" },
  { id: "preview", label: "Preview" },
  { id: "launch", label: "Launch" },
];

const PRECISION_TO_FILTER: Record<Precision, Intent> = {
  discovery: "low",
  balanced: "medium",
  high: "high",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [sessions, setSessions] = React.useState<Session[]>([]);

  // Form state across the wizard
  const [sessionId, setSessionId] = React.useState("");
  const [name, setName] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [intentDescription, setIntentDescription] = React.useState("");
  const [precision, setPrecision] = React.useState<Precision>("balanced");

  // Step 4 preview state
  const [previewing, setPreviewing] = React.useState(false);
  const [previewResults, setPreviewResults] = React.useState<ResultRow[] | null>(null);

  const [launching, setLaunching] = React.useState(false);

  // Load existing sessions for step 1. We do NOT auto-pick a session
  // anymore — the new default is "" = auto-distribute, which uses
  // every healthy account the tenant has connected.
  const reloadSessions = React.useCallback(async () => {
    const r = await fetch("/api/managed-signals");
    const d = await r.json().catch(() => ({}));
    const list: Session[] = d.sessions || [];
    setSessions(list);
  }, []);

  React.useEffect(() => {
    reloadSessions();
  }, [reloadSessions]);

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function runPreview() {
    setPreviewing(true);
    setPreviewResults(null);
    const r = await fetch("/api/historical-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId || null,
        query: keyword.trim(),
        lookback: "past-month" as Lookback,
        minIntent: PRECISION_TO_FILTER[precision],
        intentDescription: intentDescription.trim(),
        limit: 25,
      }),
    });
    const data = await r.json();
    setPreviewing(false);
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setPreviewResults(data.results || []);
  }

  async function launch() {
    setLaunching(true);
    const r = await fetch("/api/managed-signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        query: keyword.trim(),
        sessionId: sessionId || null,
        cadence: "every_6h",
        filterMinIntent: PRECISION_TO_FILTER[precision],
        intentDescription: intentDescription.trim(),
        webhookUrl:
          typeof window === "undefined" ? undefined : `${window.location.origin}/api/webhook`,
      }),
    });
    const data = await r.json();
    setLaunching(false);
    if (data.signal) {
      toast.success("Agent is now watching LinkedIn");
      router.push("/managed-signals");
    } else {
      toast.error(data.error || "Failed to create signal");
    }
  }

  // ── Per-step validation gates the Next button ─────────────────────────
  const canAdvance = (() => {
    switch (STEPS[step].id) {
      case "linkedin":
        // Auto-distribute is valid (sessionId === ""). The gate is
        // simply: at least one connected account.
        return sessions.length > 0;
      case "icp":
        return name.trim().length > 0 && keyword.trim().length >= 2 && intentDescription.trim().length >= 10;
      case "precision":
        return Boolean(precision);
      case "preview":
        return previewResults !== null;
      case "launch":
        return true;
      default:
        return false;
    }
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Set up your AI agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Five steps. Three minutes. By the end your agent is watching LinkedIn for the buyers you
          care about and queuing personalized openers.
        </p>
      </div>

      <Stepper current={step} />

      {STEPS[step].id === "linkedin" ? (
        <Step icon={<Linkedin className="h-5 w-5 text-primary" />} title="Connect a LinkedIn account">
          <p className="text-sm text-muted-foreground">
            Your agent reads LinkedIn through your real session — same posts you see in your
            browser. Cookies are AES-256-GCM encrypted at rest on MyAgentMail.
          </p>
          {sessions.length > 0 ? (
            <div className="mt-4 space-y-2">
              <Label>Routing</Label>
              <select
                value={sessionId || "__auto__"}
                onChange={(e) =>
                  setSessionId(e.target.value === "__auto__" ? "" : e.target.value)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="__auto__">
                  Auto-distribute across all {sessions.length} connected{" "}
                  {sessions.length === 1 ? "account" : "accounts"} (recommended)
                </option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    Pin to: {s.label || s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Auto spreads polling and profile lookups across every connected account, multiplying
                your daily LinkedIn quota and protecting any single account from rate limits.{" "}
                <span className="font-medium text-foreground">
                  Connect another account below to add headroom.
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              No LinkedIn account connected yet. Use the widget below.
            </p>
          )}
          <div className="mt-4 flex justify-center">
            <LinkedInConnect
              proxyUrl="/api/myagentmail/linkedin"
              onConnected={async ({ sessionId: _newId }) => {
                await fetch("/api/accounts/track", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sessionId: _newId }),
                }).catch(() => {});
                await reloadSessions();
                // Stay in auto-distribute mode after a connect — let the
                // user opt into pinning explicitly via the dropdown.
                toast.success("LinkedIn connected");
              }}
              onError={(err) => toast.error(err.message)}
            />
          </div>
        </Step>
      ) : null}

      {STEPS[step].id === "icp" ? (
        <Step icon={<Target className="h-5 w-5 text-primary" />} title="Describe your ideal customer">
          <p className="text-sm text-muted-foreground">
            Plain English. The classifier uses this as the authoritative definition of what should
            fire — the keyword is just a coarse pre-filter for the LinkedIn search.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="name">Agent name</Label>
              <Input
                id="name"
                placeholder="e.g. Founders complaining about cold email"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Just for you — shows up in /managed-signals.
              </p>
            </div>
            <div>
              <Label htmlFor="keyword">LinkedIn keyword</Label>
              <Input
                id="keyword"
                placeholder='e.g. "outbound is broken"'
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Short and broad. The classifier filters down with your firing rule.
              </p>
            </div>
            <div>
              <Label htmlFor="rule">Firing rule</Label>
              <textarea
                id="rule"
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g. Flag as ready when the author is a founder or operator at a B2B SaaS company complaining about cold email being broken, low reply rates, or their outbound team being burned out. Skip vendors selling outbound tools, agencies, content marketers, and recruiters posting job ads."
                value={intentDescription}
                onChange={(e) => setIntentDescription(e.target.value)}
                maxLength={2000}
              />
              <div className="mt-1 flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-2">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                <p className="text-[11px] text-muted-foreground">
                  Tip: include both <em>who fires</em> (founder/operator at SaaS) and{" "}
                  <em>who doesn&apos;t</em> (vendors, agencies, recruiters). The classifier
                  needs the negatives too.
                </p>
              </div>
            </div>
          </div>
        </Step>
      ) : null}

      {STEPS[step].id === "precision" ? (
        <Step icon={<Sparkles className="h-5 w-5 text-primary" />} title="Choose your agent's precision">
          <p className="text-sm text-muted-foreground">
            How strict should the agent be when forwarding matches to your webhook? You can change
            this later.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <PrecisionCard
              selected={precision === "discovery"}
              onClick={() => setPrecision("discovery")}
              label="Discovery"
              tagline="More volume, more noise"
              body="Forward every match the firing rule accepts. Best for early exploration when you want to see everything."
            />
            <PrecisionCard
              selected={precision === "balanced"}
              onClick={() => setPrecision("balanced")}
              label="Balanced"
              tagline="Recommended"
              body="Forward only matches the classifier scores medium-or-higher intent. The default sweet spot."
            />
            <PrecisionCard
              selected={precision === "high"}
              onClick={() => setPrecision("high")}
              label="High Precision"
              tagline="Fewer, better leads"
              body="Forward only the strongest matches — the author is actively asking for what you sell. Lowest noise."
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Note: <em>all</em> matches that pass the firing rule are still stored — you can see
            them in the dashboard. This setting only gates which ones trigger the webhook to your
            outreach handler.
          </p>
        </Step>
      ) : null}

      {STEPS[step].id === "preview" ? (
        <Step icon={<SearchIcon className="h-5 w-5 text-primary" />} title="Preview what your agent will catch">
          <p className="text-sm text-muted-foreground">
            Before turning the watcher on, run the firing rule against the past month of LinkedIn.
            This uses one LinkedIn API call against your connected account and shows what your
            agent would have surfaced.
          </p>
          <div className="mt-4">
            <Button onClick={runPreview} disabled={previewing}>
              <SearchIcon className="h-4 w-4" />
              {previewing ? "Searching past month…" : previewResults ? "Re-run preview" : "Run preview"}
            </Button>
          </div>
          {previewResults !== null ? (
            <div className="mt-4 rounded-md border bg-muted/20">
              <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                {previewResults.length} match{previewResults.length === 1 ? "" : "es"} in the past
                month
              </div>
              {previewResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No matches yet. Try widening your keyword or relaxing the firing rule, then go
                  back to step 2.
                </div>
              ) : (
                <ul className="divide-y">
                  {previewResults.slice(0, 8).map((r) => (
                    <li key={r.postUrl} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{r.author.name || "—"}</span>
                        <Badge
                          variant={
                            r.classification.intent === "high"
                              ? "default"
                              : r.classification.intent === "medium"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {r.classification.intent} intent
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {r.postExcerpt || "(no excerpt)"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <em>{r.classification.reason}</em>
                      </p>
                    </li>
                  ))}
                  {previewResults.length > 8 ? (
                    <li className="px-4 py-2 text-center text-[11px] text-muted-foreground">
                      + {previewResults.length - 8} more — full list available after launch
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          ) : null}
        </Step>
      ) : null}

      {STEPS[step].id === "launch" ? (
        <Step icon={<CheckCircle2 className="h-5 w-5 text-primary" />} title="Ready to launch">
          <p className="text-sm text-muted-foreground">Review your setup. Hit Launch when you&apos;re happy.</p>
          <dl className="mt-4 space-y-2 rounded-md border bg-muted/20 p-4 text-sm">
            <Row label="Agent">{name}</Row>
            <Row label="LinkedIn keyword"><code className="rounded bg-muted px-1">{keyword}</code></Row>
            <Row label="Precision">{precision}</Row>
            <Row label="Cadence">Every 6 hours</Row>
            <Row label="Webhook">
              <code className="rounded bg-muted px-1 text-[11px]">/api/webhook</code> (this app)
            </Row>
            <div className="border-t pt-2">
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Firing rule
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-xs">{intentDescription}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] text-muted-foreground">
            On every fired match the agent will POST a signed payload to{" "}
            <code className="rounded bg-muted px-1">/api/webhook</code>. The starter&apos;s default
            handler queues the lead for outreach. Edit it to change what happens.
          </p>
        </Step>
      ) : null}

      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {STEPS[step].id === "launch" ? (
          <Button onClick={launch} disabled={launching}>
            {launching ? "Launching…" : "Launch agent"}
            <Sparkles className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={next} disabled={!canAdvance}>
            Next step
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={
                done
                  ? "grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground"
                  : active
                    ? "grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[11px] font-medium text-primary"
                    : "grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px] font-medium"
              }
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={active ? "font-medium text-foreground" : ""}>{s.label}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 text-muted-foreground/60">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Step({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10">{icon}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function PrecisionCard({
  selected,
  onClick,
  label,
  tagline,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  tagline: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? "rounded-md border-2 border-primary bg-primary/5 p-4 text-left transition-colors"
          : "rounded-md border-2 border-transparent bg-muted/30 p-4 text-left transition-colors hover:bg-muted/50"
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {selected ? <Badge>Selected</Badge> : null}
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {tagline}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{body}</p>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}
