"use client";

/**
 * Overview / home — orients the user on where they are in the flow:
 * have they set up the agent yet, do they have a connected LinkedIn
 * account, an inbox, are leads landing. CTAs to the right next step.
 */

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Linkedin,
  Inbox as InboxIcon,
  Sparkles,
  Users,
} from "lucide-react";

type Status = {
  keysConfigured: boolean;
  hasAgent: boolean;
  agentLaunchedAt: string | null;
  signalCount: number;
  linkedinAccounts: number;
  inboxes: number;
  leads: { total: number; new: number; engaged: number };
};

export default function Overview() {
  const [s, setS] = React.useState<Status | null>(null);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/agent/keys").then((r) => r.json()),
      fetch("/api/agent/config").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.ok ? r.json() : { accounts: [] }),
      fetch("/api/inboxes").then((r) => r.ok ? r.json() : { inboxes: [] }),
      fetch("/api/leads/list").then((r) => r.json()),
    ]).then(([keys, cfg, acc, ib, ld]) => {
      const cfgRow = cfg?.config ?? {};
      const leads = (ld?.leads ?? []) as Array<{ status: string }>;
      setS({
        keysConfigured:
          !!keys?.status?.myagentmail?.set && !!keys?.status?.openai?.set,
        hasAgent: !!cfgRow.launchedAt,
        agentLaunchedAt: cfgRow.launchedAt ?? null,
        signalCount: (cfgRow.createdSignalIds ?? []).length,
        linkedinAccounts: (acc?.accounts ?? []).length,
        inboxes: (ib?.inboxes ?? []).length,
        leads: {
          total: leads.length,
          new: leads.filter((l) => l.status === "new").length,
          engaged: leads.filter((l) => l.status === "engaged").length,
        },
      });
    });
  }, []);

  if (!s) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outreach Starter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open-source AI agent for LinkedIn intent monitoring + cold-email outreach. Built on
          MyAgentMail.
        </p>
      </div>

      {!s.keysConfigured ? (
        <Card className="space-y-4 border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-amber-700" />
            <div>
              <h2 className="font-semibold">Configure your API keys to get started</h2>
              <p className="text-sm text-muted-foreground">
                The starter needs your MyAgentMail key + OpenAI key. We&apos;ll guide you through
                in step 1 of onboarding.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/onboarding">
              Start setup <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
      ) : !s.hasAgent ? (
        <Card className="space-y-4 border-primary/30 bg-primary/5 p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <div>
              <h2 className="font-semibold">Set up your AI lead agent</h2>
              <p className="text-sm text-muted-foreground">
                5 minutes. Paste your website, AI infers your ICP, agent starts watching LinkedIn.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/onboarding">
              Start setup <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
      ) : (
        <Card className="grid grid-cols-3 gap-4 p-6">
          <Stat label="Total leads" value={s.leads.total} />
          <Stat label="Awaiting review" value={s.leads.new} />
          <Stat label="Engaged" value={s.leads.engaged} />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ChecklistItem
          done={s.linkedinAccounts > 0}
          icon={Linkedin}
          title={s.linkedinAccounts > 0 ? `${s.linkedinAccounts} LinkedIn account(s) connected` : "Connect a LinkedIn account"}
          href="/accounts"
        />
        <ChecklistItem
          done={s.inboxes > 0}
          icon={InboxIcon}
          title={s.inboxes > 0 ? `${s.inboxes} inbox(es) configured` : "Provision a sending inbox"}
          href="/inboxes"
        />
        <ChecklistItem
          done={s.hasAgent}
          icon={Sparkles}
          title={s.hasAgent ? `Agent launched — ${s.signalCount} signal(s) running` : "Set up your AI agent"}
          href="/onboarding"
        />
        <ChecklistItem
          done={s.leads.total > 0}
          icon={Users}
          title={s.leads.total > 0 ? `${s.leads.total} lead(s) in queue` : "Review leads"}
          href="/leads"
        />
      </div>

      <Card className="p-6 text-sm">
        <h2 className="mb-2 font-semibold">How it works</h2>
        <ol className="space-y-1.5 text-muted-foreground">
          <li>1. AI reads your website, infers your ICP and the LinkedIn signals worth tracking.</li>
          <li>2. We create keyword + engagement + watchlist signals on MyAgentMail.</li>
          <li>3. Polls run on cadence; matches arrive at your /api/webhook and land in /leads.</li>
          <li>4. One-click drafts personalized LinkedIn notes + cold emails per lead.</li>
          <li>5. Approve and send. Replies land in your inbox.</li>
        </ol>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ChecklistItem({
  done,
  icon: Icon,
  title,
  href,
}: {
  done: boolean;
  icon: typeof Circle;
  title: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border bg-background p-4 transition-colors hover:bg-muted/40"
    >
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground" />
      )}
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm">{title}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
