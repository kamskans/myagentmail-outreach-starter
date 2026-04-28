"use client";

/**
 * Unified leads queue.
 *
 * One row per matched person regardless of which signal kind fired
 * (keyword post, engagement, job change). Each row has independent
 * LinkedIn outreach state and email outreach state — both channels
 * live on the same lead. Actions:
 *
 *   - Draft LinkedIn   (POST /api/leads/{id}/draft  channel=linkedin)
 *   - Send LinkedIn    (POST /api/leads/{id}/send   channel=linkedin)
 *   - Draft email      (POST /api/leads/{id}/draft  channel=email)
 *   - Send email       (POST /api/leads/{id}/send   channel=email)
 *   - Archive          (POST /api/leads/{id}/status status=archived)
 *
 * Polls every 5 seconds for new arrivals while the page is open — so
 * after a fresh agent launch the user sees leads stream in.
 */

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Linkedin,
  Mail,
  Sparkles,
  ExternalLink,
  Send,
  Archive,
  Loader2,
  Search,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Lead = {
  id: number;
  profileUrl: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  headline: string | null;
  email: string | null;
  sourceKind: "keyword" | "engagement" | "job_change" | "manual";
  sourceSignalName: string | null;
  triggerPostUrl: string | null;
  triggerPostExcerpt: string | null;
  triggerEngagerAction: "commented" | "reacted" | null;
  triggerEngagerComment: string | null;
  triggerJobChange: {
    oldRole: string | null;
    oldCompany: string | null;
    newRole: string | null;
    newCompany: string | null;
  } | null;
  classificationIntent: "low" | "medium" | "high" | null;
  classificationReason: string | null;
  linkedinDraft: string | null;
  linkedinStatus: "new" | "drafted" | "sent" | "declined";
  linkedinSentAt: string | null;
  emailDraftSubject: string | null;
  emailDraftBody: string | null;
  emailStatus: "new" | "drafted" | "sent" | "replied";
  emailSentAt: string | null;
  status: "new" | "reviewing" | "engaged" | "archived";
  createdAt: string;
};

const KIND_LABELS: Record<Lead["sourceKind"], string> = {
  keyword: "Keyword",
  engagement: "Engaged",
  job_change: "Job change",
  manual: "Manual",
};

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "new" | "engaged" | "archived">("new");

  const reload = React.useCallback(async () => {
    const r = await fetch(
      `/api/leads/list${filter !== "all" ? `?status=${filter}` : ""}`,
    );
    const data = await r.json();
    setLeads(data.leads || []);
    setLoading(false);
  }, [filter]);

  React.useEffect(() => {
    reload();
    const interval = setInterval(reload, 5000);
    return () => clearInterval(interval);
  }, [reload]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every match your agent surfaces, ready for one-click outreach.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border p-1 text-xs">
          {(["new", "engaged", "archived", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 capitalize ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : leads.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">No leads in this view yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your agent polls daily by default. New matches will appear here as they fire.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [busyChannel, setBusyChannel] = React.useState<"linkedin" | "email" | null>(null);
  const [enriching, setEnriching] = React.useState(false);
  const [showDraftLinkedIn, setShowDraftLinkedIn] = React.useState(false);
  const [showDraftEmail, setShowDraftEmail] = React.useState(false);
  const [linkedinText, setLinkedinText] = React.useState(lead.linkedinDraft ?? "");
  const [emailSubject, setEmailSubject] = React.useState(lead.emailDraftSubject ?? "");
  const [emailBody, setEmailBody] = React.useState(lead.emailDraftBody ?? "");

  React.useEffect(() => {
    setLinkedinText(lead.linkedinDraft ?? "");
    setEmailSubject(lead.emailDraftSubject ?? "");
    setEmailBody(lead.emailDraftBody ?? "");
  }, [lead.linkedinDraft, lead.emailDraftSubject, lead.emailDraftBody]);

  async function draft(channel: "linkedin" | "email") {
    setBusyChannel(channel);
    try {
      const r = await fetch(`/api/leads/${lead.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "draft failed");
      if (channel === "linkedin") {
        setLinkedinText(data.draft);
        setShowDraftLinkedIn(true);
      } else {
        setEmailSubject(data.draft.subject);
        setEmailBody(data.draft.body);
        setShowDraftEmail(true);
      }
      toast.success("Draft ready — review before sending");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Draft failed");
    } finally {
      setBusyChannel(null);
    }
  }

  async function send(channel: "linkedin" | "email") {
    setBusyChannel(channel);
    try {
      const r = await fetch(`/api/leads/${lead.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "send failed");
      toast.success(`Sent via ${channel}`);
      if (channel === "linkedin") setShowDraftLinkedIn(false);
      else setShowDraftEmail(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Send failed");
    } finally {
      setBusyChannel(null);
    }
  }

  async function enrich() {
    setEnriching(true);
    try {
      const r = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "enrichment failed");
      toast.success(
        data.cached
          ? `Already had ${data.email}`
          : `Found ${data.email}${data.confidence ? ` (${data.confidence})` : ""}`,
      );
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not find an email");
    } finally {
      setEnriching(false);
    }
  }

  async function archive() {
    await fetch(`/api/leads/${lead.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    toast.success("Archived");
    onChanged();
  }

  const intentColor =
    lead.classificationIntent === "high"
      ? "text-emerald-700"
      : lead.classificationIntent === "medium"
        ? "text-amber-700"
        : "text-muted-foreground";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{lead.name || "—"}</span>
            <Badge variant="outline" className="text-[10px]">
              {KIND_LABELS[lead.sourceKind]}
            </Badge>
            {lead.classificationIntent ? (
              <span className={`text-[11px] ${intentColor}`}>
                {lead.classificationIntent} intent
              </span>
            ) : null}
            {lead.linkedinStatus === "sent" ? (
              <span className="text-[11px] text-blue-700">LinkedIn sent</span>
            ) : null}
            {lead.emailStatus === "sent" ? (
              <span className="text-[11px] text-blue-700">Email sent</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {lead.role ? lead.role : ""}
            {lead.role && lead.company ? " at " : ""}
            {lead.company ? lead.company : ""}
            {!lead.role && !lead.company && lead.headline ? lead.headline : ""}
          </div>
          <TriggerLine lead={lead} />
          {lead.classificationReason ? (
            <p className="mt-1 text-[11px] italic text-muted-foreground">
              {lead.classificationReason}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <a
            href={lead.profileUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View profile <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-[11px] text-muted-foreground">{fmtDate(lead.createdAt)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          size="sm"
          variant={lead.linkedinDraft ? "outline" : "default"}
          onClick={() =>
            lead.linkedinDraft
              ? setShowDraftLinkedIn(!showDraftLinkedIn)
              : draft("linkedin")
          }
          disabled={busyChannel === "linkedin"}
        >
          {busyChannel === "linkedin" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Linkedin className="h-4 w-4" />
          )}
          {lead.linkedinDraft ? (showDraftLinkedIn ? "Hide draft" : "View draft") : "Draft LinkedIn"}
        </Button>
        <Button
          size="sm"
          variant={lead.emailDraftBody ? "outline" : "default"}
          onClick={() =>
            lead.emailDraftBody ? setShowDraftEmail(!showDraftEmail) : draft("email")
          }
          disabled={busyChannel === "email"}
        >
          {busyChannel === "email" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          {lead.emailDraftBody ? (showDraftEmail ? "Hide draft" : "View draft") : "Draft email"}
        </Button>
        {!lead.email ? (
          <Button size="sm" variant="ghost" onClick={enrich} disabled={enriching || !lead.profileUrl}>
            {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find email
          </Button>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <Mail className="h-3.5 w-3.5" />
            {lead.email}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={archive}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
      </div>

      {showDraftLinkedIn ? (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              LinkedIn note ({linkedinText.length}/280)
            </Label>
            <Button size="sm" variant="ghost" onClick={() => draft("linkedin")} disabled={busyChannel === "linkedin"}>
              <Sparkles className="h-3.5 w-3.5" /> Re-draft
            </Button>
          </div>
          <textarea
            rows={3}
            maxLength={280}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={linkedinText}
            onChange={(e) => setLinkedinText(e.target.value)}
            onBlur={() => {
              if (linkedinText !== lead.linkedinDraft) {
                fetch(`/api/leads/${lead.id}/draft`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ channel: "linkedin", text: linkedinText }),
                });
              }
            }}
          />
          <Button size="sm" onClick={() => send("linkedin")} disabled={busyChannel !== null}>
            <Send className="h-3.5 w-3.5" /> Send connection request
          </Button>
        </div>
      ) : null}

      {showDraftEmail ? (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Cold email
            </Label>
            <Button size="sm" variant="ghost" onClick={() => draft("email")} disabled={busyChannel === "email"}>
              <Sparkles className="h-3.5 w-3.5" /> Re-draft
            </Button>
          </div>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
            placeholder="Subject"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
          />
          <textarea
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Body"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
          <Button size="sm" onClick={() => send("email")} disabled={busyChannel !== null || !lead.email}>
            <Send className="h-3.5 w-3.5" /> Send email
          </Button>
          {!lead.email ? (
            <p className="text-[11px] text-amber-700">
              No email on file — click <strong>Find email</strong> above (uses RocketReach by
              default; configure the key in /onboarding step 1) or paste an address manually.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function TriggerLine({ lead }: { lead: Lead }) {
  if (lead.sourceKind === "engagement") {
    if (lead.triggerEngagerComment) {
      return (
        <p className="mt-1 line-clamp-2 text-xs">
          <span className="text-muted-foreground">Commented on </span>
          <a
            href={lead.triggerPostUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {lead.sourceSignalName ?? "tracked actor"}
          </a>
          : <span className="italic">&ldquo;{lead.triggerEngagerComment}&rdquo;</span>
        </p>
      );
    }
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Reacted to {lead.sourceSignalName ?? "tracked actor"}&apos;s post
      </p>
    );
  }
  if (lead.sourceKind === "job_change" && lead.triggerJobChange) {
    const c = lead.triggerJobChange;
    return (
      <p className="mt-1 text-xs">
        <span className="text-muted-foreground">Moved from</span>{" "}
        {c.oldRole ?? "?"} at {c.oldCompany ?? "?"}{" "}
        <span className="text-muted-foreground">to</span> {c.newRole} at {c.newCompany}
      </p>
    );
  }
  if (lead.sourceKind === "keyword" && lead.triggerPostExcerpt) {
    return (
      <p className="mt-1 line-clamp-2 text-xs">
        <span className="text-muted-foreground">Posted: </span>
        <a
          href={lead.triggerPostUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="italic hover:underline"
        >
          &ldquo;{lead.triggerPostExcerpt}&rdquo;
        </a>
      </p>
    );
  }
  return null;
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-xs font-medium ${className ?? ""}`}>{children}</span>;
}
