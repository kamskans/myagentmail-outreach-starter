"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SetupPage() {
  const [s, setS] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(() => {
    fetch("/api/setup").then((r) => r.json()).then(setS);
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function bootstrapInbox() {
    setBusy(true);
    try {
      const r = await fetch("/api/setup", { method: "POST" });
      const data = await r.json();
      if (data.ok) {
        toast.success(`Inbox ready: ${data.inbox.email}`);
        reload();
      } else {
        toast.error(data.error || "Failed");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  if (!s) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Walk through these steps in order.</p>
      </div>

      <Step
        n={1}
        title="Set environment variables"
        done={s.myAgentMail.configured && s.openAi.configured && s.cron.configured}
      >
        <p className="text-sm text-muted-foreground">
          Copy <code className="rounded bg-muted px-1">.env.example</code> to{" "}
          <code className="rounded bg-muted px-1">.env</code> and fill in your keys, then restart the
          dev server.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <Bullet ok={s.myAgentMail.configured} /> <code>MYAGENTMAIL_API_KEY</code>{" "}
            <a
              href="https://myagentmail.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              get from /dashboard
            </a>
          </li>
          <li className="flex items-center gap-2">
            <Bullet ok={s.openAi.configured} /> <code>OPENAI_API_KEY</code>
          </li>
          <li className="flex items-center gap-2">
            <Bullet ok={s.cron.configured} /> <code>CRON_SECRET</code> (any random string)
          </li>
          <li className="flex items-center gap-2">
            <Bullet ok={s.rocketReach.configured} warn /> <code>ROCKETREACH_API_KEY</code>{" "}
            <span className="text-xs text-muted-foreground">— optional, for lead enrichment</span>
          </li>
        </ul>
      </Step>

      <Step n={2} title="Create your default inbox" done={s.inboxes.count > 0}>
        <p className="text-sm text-muted-foreground">
          One-click: provisions{" "}
          <code className="rounded bg-muted px-1">
            {process.env.NEXT_PUBLIC_DEFAULT_INBOX || "scout"}@myagentmail.com
          </code>{" "}
          via the MyAgentMail API.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={bootstrapInbox} disabled={busy || !s.myAgentMail.configured}>
            {s.inboxes.count > 0 ? "Inbox ready" : busy ? "Creating…" : "Create inbox"}
          </Button>
          {s.inboxes.primary ? (
            <span className="font-mono text-xs text-muted-foreground">{s.inboxes.primary}</span>
          ) : null}
        </div>
      </Step>

      <Step n={3} title="Connect a LinkedIn account" done={s.linkedInAccounts.count > 0}>
        <p className="text-sm text-muted-foreground">
          Add a session by logging in with email + password (handles 2FA) or by importing existing{" "}
          <code className="rounded bg-muted px-1">li_at</code> /{" "}
          <code className="rounded bg-muted px-1">JSESSIONID</code> cookies. You can connect
          multiple — the signal poller picks one per signal.
        </p>
        <Button asChild className="mt-3" variant={s.linkedInAccounts.count > 0 ? "outline" : "default"}>
          <Link href="/accounts">{s.linkedInAccounts.count > 0 ? "Manage accounts" : "Add account"}</Link>
        </Button>
      </Step>

      <Step n={4} title="Create your first intent signal" done={s.signals.enabled > 0}>
        <p className="text-sm text-muted-foreground">
          A signal is a keyword the agent watches on LinkedIn. Each new matching post is classified;
          high-intent ones get a personalized message queued for your approval.
        </p>
        <Button asChild className="mt-3" variant={s.signals.enabled > 0 ? "outline" : "default"}>
          <Link href="/signals">{s.signals.enabled > 0 ? "Manage signals" : "Create signal"}</Link>
        </Button>
      </Step>

      <Step n={5} title="Schedule the cron" done={false}>
        <p className="text-sm text-muted-foreground">
          The signal loop runs whenever <code className="rounded bg-muted px-1">/api/cron</code> is
          hit. Pick one:
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <strong>Vercel:</strong> add{" "}
            <code className="rounded bg-muted px-1">vercel.json</code>:
            <pre className="mt-2 overflow-x-auto rounded-md border bg-muted p-3 text-xs">{`{ "crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }] }`}</pre>
          </li>
          <li>
            <strong>Manual:</strong> hit it from the dashboard:
            <Button
              size="sm"
              className="ml-2 inline-flex"
              variant="outline"
              onClick={async () => {
                const r = await fetch("/api/signals/run", { method: "POST" });
                const data = await r.json();
                toast.success(
                  `Ran ${data.summaries?.length ?? 0} signal(s). Check the queue for new actions.`,
                );
              }}
            >
              Run signals now
            </Button>
          </li>
          <li>
            <strong>Self-hosted:</strong> any scheduler can call{" "}
            <code className="rounded bg-muted px-1">
              curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; ${"{HOST}"}/api/cron
            </code>
            .
          </li>
        </ul>
      </Step>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-3">
        <span
          className={
            done
              ? "grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"
              : "grid h-7 w-7 place-items-center rounded-full bg-muted text-sm font-medium"
          }
        >
          {done ? "✓" : n}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        {done ? <Badge variant="success">Done</Badge> : null}
      </div>
      <div className="ml-10">{children}</div>
    </Card>
  );
}

function Bullet({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      className={
        ok
          ? "h-2 w-2 rounded-full bg-emerald-500"
          : warn
            ? "h-2 w-2 rounded-full bg-amber-500"
            : "h-2 w-2 rounded-full bg-rose-500"
      }
    />
  );
}
