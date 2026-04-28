"use client";

/**
 * Custom domains.
 *
 * Showcases MyAgentMail's bring-your-own-domain story:
 *   - Add a domain (api/domains POST) → API returns the DNS records
 *     the customer must add to their registrar.
 *   - Add the records, click "Check verification" → /verify hits SES +
 *     Stalwart and updates status (pending → verifying → verified).
 *   - Once verified, the domain shows up in the inbox-provisioning
 *     dropdown. Provision yourname@yourdomain.com inboxes that
 *     send through SES + receive through Stalwart end-to-end.
 *
 * Removing a domain cleans up SES verified-identity + Stalwart inbound.
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Trash2,
  Globe,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

type DomainStatus = "pending" | "verifying" | "verified" | "failed" | "unknown";

type DnsRecord = {
  type: "TXT" | "MX" | "CNAME" | "DKIM";
  host: string;
  value: string;
  priority?: number;
};

type Domain = {
  domain: string;
  status: DomainStatus;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  isDefault?: boolean;
  createdAt: string;
  verifiedAt: string | null;
  records?: DnsRecord[];
};

export default function DomainsPage() {
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/domains").then((x) => x.json());
    setDomains(r?.domains ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom domains</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring your own domain. Inboxes provisioned under a verified custom domain send through
            AWS SES and receive through Stalwart — end-to-end yourname@yourdomain.com.{" "}
            <Link href="/inboxes" className="text-primary hover:underline">
              Provision an inbox →
            </Link>
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add domain
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : domains.length === 0 ? (
        <Card className="p-10 text-center">
          <Globe className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No custom domains yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a domain to provision inboxes under it. Free tier supports unlimited domains.
          </p>
          <Button className="mt-4" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add your first domain
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((d) => (
            <DomainRow key={d.domain} domain={d} onChanged={reload} />
          ))}
        </div>
      )}

      <AddDomainModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => {
          setShowAdd(false);
          reload();
        }}
      />
    </div>
  );
}

function DomainRow({ domain, onChanged }: { domain: Domain; onChanged: () => void }) {
  const [busy, setBusy] = React.useState<"verify" | "delete" | null>(null);
  const [showRecords, setShowRecords] = React.useState(domain.status !== "verified");

  async function verify() {
    setBusy("verify");
    try {
      const r = await fetch(`/api/domains/${encodeURIComponent(domain.domain)}/verify`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "verify failed");
      const newStatus = data.domain?.status as DomainStatus;
      if (newStatus === "verified") {
        toast.success(`${domain.domain} verified ✓`);
        setShowRecords(false);
      } else {
        toast.message(
          newStatus === "pending"
            ? "DNS records not yet detected — give your registrar a few more minutes."
            : `Status: ${newStatus}`,
        );
      }
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not verify");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${domain.domain}? Inboxes under this domain will stop receiving and sending.`)) {
      return;
    }
    setBusy("delete");
    try {
      const r = await fetch(`/api/domains/${encodeURIComponent(domain.domain)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? "delete failed");
      }
      toast.success(`Removed ${domain.domain}`);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium font-mono">{domain.domain}</span>
            <StatusBadge status={domain.status} />
            {domain.inboundEnabled ? (
              <Badge variant="outline" className="text-[10px]">
                inbound
              </Badge>
            ) : null}
            {domain.outboundEnabled ? (
              <Badge variant="outline" className="text-[10px]">
                outbound
              </Badge>
            ) : null}
            {domain.isDefault ? (
              <Badge variant="outline" className="text-[10px]">
                default
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Added {fmtDate(domain.createdAt)}
            {domain.verifiedAt ? ` · Verified ${fmtDate(domain.verifiedAt)}` : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {domain.status !== "verified" ? (
            <Button size="sm" onClick={verify} disabled={busy === "verify"}>
              {busy === "verify" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Check verification
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowRecords(!showRecords)}
          >
            {showRecords ? "Hide" : "View"} DNS records
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={remove}
            disabled={busy === "delete"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showRecords && domain.records && domain.records.length > 0 ? (
        <div className="mt-4 border-t pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Add these records at your registrar
            </p>
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {domain.domain} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">
                    Host
                  </th>
                  <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">
                    Value
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {domain.records.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 font-mono">
                      <Badge variant="outline" className="text-[10px]">
                        {r.type}
                      </Badge>
                      {r.priority != null ? (
                        <span className="ml-2 text-muted-foreground">prio {r.priority}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.host}</td>
                    <td className="px-3 py-2 font-mono break-all text-muted-foreground">
                      {r.value}
                    </td>
                    <td className="px-3 py-2">
                      <CopyButton value={r.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Most registrars propagate within 5–15 minutes. Click <strong>Check verification</strong>{" "}
            once you&apos;ve added the records.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: DomainStatus }) {
  const map: Record<DomainStatus, { label: string; cls: string; icon: React.ComponentType<any> }> = {
    pending: {
      label: "Pending DNS",
      cls: "bg-amber-100 text-amber-800",
      icon: Clock,
    },
    verifying: {
      label: "Verifying",
      cls: "bg-blue-100 text-blue-800",
      icon: Loader2,
    },
    verified: {
      label: "Verified",
      cls: "bg-emerald-100 text-emerald-800",
      icon: CheckCircle2,
    },
    failed: {
      label: "Failed",
      cls: "bg-destructive/10 text-destructive",
      icon: AlertCircle,
    },
    unknown: {
      label: "Unknown",
      cls: "bg-muted text-muted-foreground",
      icon: AlertCircle,
    },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <Icon className={`h-3 w-3 ${status === "verifying" ? "animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy"
      className="rounded p-1 hover:bg-muted"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function AddDomainModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [domain, setDomain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setDomain("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const r = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: clean }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Failed to add");
      toast.success(`Added ${clean} — add the DNS records to verify`);
      onAdded();
    } catch (err: any) {
      setError(err?.message ?? "Could not add domain");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-lg font-semibold">Add a custom domain</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          We&apos;ll generate the DNS records (MX for inbound, TXT/DKIM/SPF for outbound) you need
          to add at your registrar. Verification takes a few minutes after the records propagate.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="dom">Domain</Label>
            <Input
              id="dom"
              placeholder="yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              No <code>https://</code>, no path. Subdomains supported (e.g. mail.yourdomain.com).
            </p>
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
          <Button onClick={submit} disabled={busy || !domain}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add domain
          </Button>
        </div>
      </Card>
    </div>
  );
}
