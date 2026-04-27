"use client";

/**
 * LinkedIn account management — uses the @myagentmail/react widget
 * for the connect flow. Local SQLite mirrors the connected sessionIds
 * so the table can render without round-tripping to MyAgentMail every
 * page load.
 */

import * as React from "react";
import { toast } from "sonner";
import { LinkedInConnect } from "@myagentmail/react";
import "@myagentmail/react/styles.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";

type Account = {
  id: string;
  label: string;
  sessionId: string;
  status: string;
  remoteStatus: string;
  createdAt: string;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [showWidget, setShowWidget] = React.useState(false);

  const reload = React.useCallback(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []));
  }, []);
  React.useEffect(() => reload(), [reload]);

  async function remove(id: string) {
    if (!confirm("Disconnect this LinkedIn account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    toast.success("Disconnected");
    reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect one or more LinkedIn accounts. Signals can pin to a specific account, or fall
            back to the first active one.
          </p>
        </div>
        <Button onClick={() => setShowWidget(true)}>
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Label
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  No accounts yet. Add one to start watching LinkedIn for signals.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{a.label}</td>
                  <td className="px-4 py-3">
                    <Badge variant={a.remoteStatus === "active" ? "success" : "warning"}>
                      {a.remoteStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {fmtDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showWidget ? (
        <div className="flex justify-center">
          <LinkedInConnect
            proxyUrl="/api/myagentmail/linkedin"
            onConnected={async ({ sessionId, label }) => {
              // Mirror the connection into the local SQLite so the
              // table renders without a round-trip to MyAgentMail.
              await fetch("/api/accounts/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, label }),
              });
              toast.success("Account connected");
              setShowWidget(false);
              reload();
            }}
            onCancel={() => setShowWidget(false)}
            onError={(err) => toast.error(err.message)}
          />
        </div>
      ) : null}
    </div>
  );
}
