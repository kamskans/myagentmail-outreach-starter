"use client";

/**
 * Inboxes — list, provision, manage.
 *
 * Showcases MyAgentMail's email layer: every inbox is a real
 * send/receive address with full IMAP/SMTP, custom domain support,
 * draft management, and per-inbox WebSocket streams. Provisioning is
 * a single API call — no manual DNS dance unless you bring a custom
 * domain (in which case we drop you into /domains).
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight,
  Plus,
  Inbox as InboxIcon,
  Trash2,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/utils";

type Inbox = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  domain?: string | null;
  createdAt: string;
};

type Domain = {
  domain: string;
  status: "pending" | "verifying" | "verified" | "failed" | "unknown";
};

export default function InboxesPage() {
  const [inboxes, setInboxes] = React.useState<Inbox[]>([]);
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const [ib, dm] = await Promise.all([
      fetch("/api/inboxes").then((r) => r.json()),
      fetch("/api/domains").then((r) => r.json()),
    ]);
    setInboxes(ib?.inboxes || []);
    setDomains((dm?.domains || []).filter((d: Domain) => d.status === "verified"));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function deleteInbox(id: string, email: string) {
    if (!confirm(`Deprovision ${email}? Existing mail stays in the archive but the address stops receiving.`)) {
      return;
    }
    const r = await fetch(`/api/inboxes/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      toast.error(data?.error ?? "Could not delete inbox");
      return;
    }
    toast.success("Inbox deprovisioned");
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inboxes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real email addresses provisioned via MyAgentMail. Send + receive + drafts + IMAP/SMTP +
            real-time WebSocket events. Provision more for separate teams, products, or
            environments.{" "}
            <Link href="/domains" className="text-primary hover:underline">
              Bring your own domain →
            </Link>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New inbox
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CapabilityCard
          title="Send + receive"
          desc="Full SMTP/IMAP, AWS SES outbound, Stalwart inbound. Each inbox has a stable address you can put on signatures, websites, and outreach."
        />
        <CapabilityCard
          title="Real-time events"
          desc="Per-inbox /v1/ws stream pushes message.received / message.sent / message.bounced events to your app within a second of delivery."
        />
        <CapabilityCard
          title="Custom domains"
          desc="Bring your own domain in /domains, add the DNS records, verify, then provision inboxes under it. yourname@yourdomain.com works end-to-end."
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Display name
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : inboxes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No inboxes yet. Click <strong>New inbox</strong> to provision one.
                </td>
              </tr>
            ) : (
              inboxes.map((i) => (
                <tr key={i.id} className="border-b last:border-b-0 transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono">
                    <Link href={`/inboxes/${i.id}`} className="text-primary hover:underline">
                      {i.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{i.displayName || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {fmtDate(i.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/inboxes/${i.id}`}
                        aria-label="Open inbox"
                        className="rounded p-1 hover:bg-muted"
                      >
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteInbox(i.id, i.email)}
                        aria-label="Delete"
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <CreateInboxModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        verifiedDomains={domains}
        onCreated={() => {
          setShowCreate(false);
          reload();
        }}
      />
    </div>
  );
}

function CapabilityCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <InboxIcon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </Card>
  );
}

function CreateInboxModal({
  open,
  onClose,
  verifiedDomains,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  verifiedDomains: Domain[];
  onCreated: () => void;
}) {
  const [username, setUsername] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setUsername("");
      setDisplayName("");
      setDomain("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/inboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || undefined,
          domain: domain || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Failed to create");
      toast.success(`Provisioned ${data.inbox.email}`);
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? "Could not create inbox");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-lg font-semibold">Provision a new inbox</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          We&apos;ll wire MX records (Stalwart for inbound) and SES for outbound. The address is
          live the moment provisioning completes.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="ib-username">Username</Label>
            <Input
              id="ib-username"
              placeholder="sales"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="ib-display">Display name (optional)</Label>
            <Input
              id="ib-display"
              placeholder="e.g. Sales — John"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ib-domain">Domain</Label>
            <select
              id="ib-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">myagentmail.com (default)</option>
              {verifiedDomains.map((d) => (
                <option key={d.domain} value={d.domain}>
                  {d.domain}
                </option>
              ))}
            </select>
            {verifiedDomains.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Want yourname@yourdomain.com?{" "}
                <Link href="/domains" className="text-primary hover:underline">
                  Add a custom domain →
                </Link>
              </p>
            ) : null}
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Resulting address:{" "}
            <span className="font-mono text-foreground">
              {(username || "username")}@{domain || "myagentmail.com"}
            </span>
          </div>
          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !username}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Provision inbox
          </Button>
        </div>
      </Card>
    </div>
  );
}
