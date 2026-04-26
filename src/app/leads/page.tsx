"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Sparkles } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Lead = {
  id: number;
  name: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: string | null;
  title: string | null;
  source: string | null;
  enrichedAt: string | null;
  createdAt: string;
};

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const reload = React.useCallback(() => {
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads || []));
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function enrich(id: number) {
    const r = await fetch("/api/leads/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id }),
    });
    const data = await r.json();
    if (data.ok) {
      toast.success("Enriched");
      reload();
    } else {
      toast.error(data.error || "Lookup returned no match");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual lead list. Enrich with RocketReach to fill in email + title (optional).
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add lead
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Company / Title
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Added
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                  No leads yet.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.name || "—"}</div>
                    {l.linkedinUrl ? (
                      <a
                        href={l.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary hover:underline"
                      >
                        LinkedIn ↗
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {[l.title, l.company].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.email || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(l.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-[11px]"
                      onClick={() => enrich(l.id)}
                    >
                      <Sparkles className="h-3 w-3" />
                      {l.enrichedAt ? "Re-enrich" : "Enrich"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showForm ? (
        <NewLeadForm
          onDone={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
    </div>
  );
}

function NewLeadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    linkedinUrl: "",
    company: "",
    title: "",
  });
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    const r = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        email: form.email || null,
        linkedinUrl: form.linkedinUrl || null,
      }),
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Lead added");
      onDone();
    } else {
      toast.error("Failed");
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">New lead</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["name", "email", "linkedinUrl", "company", "title"] as const).map((k) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={k}>{k}</Label>
            <Input
              id={k}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
