"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SetupStatus = {
  myAgentMail: { configured: boolean; error?: string };
  openAi: { configured: boolean };
  cron: { configured: boolean };
  rocketReach: { configured: boolean };
  approvalMode: string;
  inboxes: { count: number; primary: string | null };
  linkedInAccounts: { count: number };
  signals: { count: number; enabled: number };
};

export default function OverviewPage() {
  const [s, setS] = React.useState<SetupStatus | null>(null);
  React.useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const ready =
    s.myAgentMail.configured &&
    s.openAi.configured &&
    s.inboxes.count > 0 &&
    s.linkedInAccounts.count > 0 &&
    s.signals.enabled > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outreach Starter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open-source contextual LinkedIn signal monitoring + email outreach, built on{" "}
          <a
            href="https://myagentmail.com"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            MyAgentMail
          </a>
          .
        </p>
      </div>

      {!ready ? (
        <Card className="border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Finish setup to start outreach</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your MyAgentMail key, link a LinkedIn account, and create your first intent signal.
              </p>
            </div>
            <Button asChild>
              <Link href="/setup">Continue setup →</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Inboxes" value={s.inboxes.count} sub={s.inboxes.primary ?? undefined} />
        <Stat label="LinkedIn accounts" value={s.linkedInAccounts.count} />
        <Stat label="Active signals" value={s.signals.enabled} sub={`${s.signals.count} total`} />
        <Stat label="Approval mode" value={s.approvalMode} />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Configuration
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <Row
            label="MyAgentMail API key"
            ok={s.myAgentMail.configured}
            err={s.myAgentMail.error}
          />
          <Row label="OpenAI API key" ok={s.openAi.configured} />
          <Row label="Cron secret" ok={s.cron.configured} />
          <Row
            label="RocketReach (optional)"
            ok={s.rocketReach.configured}
            warn={!s.rocketReach.configured}
            warnText="Enrichment disabled"
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          What this starter does
        </h2>
        <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Watches LinkedIn</strong> for posts matching keywords
            you care about.
          </li>
          <li>
            <strong className="text-foreground">Decides who's worth engaging</strong> — an LLM
            filters out generic, off-topic, or spammy posts.
          </li>
          <li>
            <strong className="text-foreground">Drafts the message</strong> — personalized 280-char
            connect note or cold email tied to the post.
          </li>
          <li>
            <strong className="text-foreground">Queues for your approval</strong> before anything
            sends. Switch <code className="rounded bg-muted px-1">APPROVAL_MODE=auto</code> if you
            want autonomous mode.
          </li>
          <li>
            <strong className="text-foreground">Sends via your own MyAgentMail</strong> — your
            inboxes, your domains, your LinkedIn account.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

function Row({
  label,
  ok,
  err,
  warn,
  warnText,
}: {
  label: string;
  ok: boolean;
  err?: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span>{label}</span>
      {ok ? (
        <Badge variant="success">Configured</Badge>
      ) : warn ? (
        <Badge variant="warning">{warnText || "Not configured"}</Badge>
      ) : (
        <Badge variant="destructive">Missing</Badge>
      )}
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </div>
  );
}
