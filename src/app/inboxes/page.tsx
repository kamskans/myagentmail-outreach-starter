"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/utils";

export default function InboxesPage() {
  const [inboxes, setInboxes] = React.useState<any[]>([]);
  const [primaryEmail, setPrimaryEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setPrimaryEmail(d.inboxes?.primary || null));

    // Pull live inbox list directly from MyAgentMail
    fetch("/api/inboxes")
      .then((r) => r.json())
      .then((d) => setInboxes(d.inboxes || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inboxes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Email inboxes provisioned via MyAgentMail. Click an inbox to read mail, send messages,
          and manage drafts. For advanced settings (custom domains, per-inbox API keys, IMAP
          creds) head to the{" "}
          <a
            href="https://myagentmail.com/dashboard/inboxes"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            MyAgentMail dashboard ↗
          </a>
          .
        </p>
      </div>

      {primaryEmail ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Primary inbox</h2>
              <p className="mt-1 font-mono text-sm">{primaryEmail}</p>
            </div>
            <Badge variant="success">Default sender</Badge>
          </div>
        </Card>
      ) : null}

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
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {inboxes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No inboxes yet. Run the setup to create one.
                </td>
              </tr>
            ) : (
              inboxes.map((i) => (
                <tr
                  key={i.id}
                  className="border-b last:border-b-0 transition-colors hover:bg-muted/40"
                >
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
                    <Link href={`/inboxes/${i.id}`} aria-label="Open inbox">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
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
