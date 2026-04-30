"use client";

/**
 * Sequence editor — wraps the <CadenceBuilder /> widget from
 * @myagentmail/react with a back link and an inline pause/resume
 * control. The widget handles step list, kind picker (LinkedIn
 * invite/DM, email, wait), per-step delay, branch conditions
 * (after_accept, no_reply_to_prev, never_replied), and AI-or-static
 * draft strategy. It POSTs through /api/myagentmail/* via the
 * mamProxyHandler we wire in /api/myagentmail/[...path]/route.ts.
 *
 * Route params:
 *   /sequences/new     → cadenceId={null} (create flow)
 *   /sequences/<id>    → cadenceId="<id>" (load + edit existing)
 *
 * Pause = PATCH /v1/cadences/:id { enabled: false }. The runner skips
 * sequences with enabled=false on its next tick (~5 min cron).
 */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CadenceBuilder } from "@myagentmail/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SequenceEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = params?.id;
  const cadenceId = !id || id === "new" ? null : id;

  // Pause/resume — fetched separately because the builder widget doesn't
  // expose enabled outwards. Cheap GET on mount + after onSaved.
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refreshStatus = React.useCallback(async () => {
    if (!cadenceId) return;
    try {
      const res = await fetch(`/api/myagentmail/cadences/${cadenceId}`);
      const json = await res.json();
      if (res.ok && json?.cadence) {
        setEnabled(Boolean(json.cadence.enabled));
      }
    } catch {
      /* non-fatal — fall back to no badge */
    }
  }, [cadenceId]);

  React.useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function toggle() {
    if (!cadenceId || enabled === null) return;
    setBusy(true);
    try {
      const next = !enabled;
      const res = await fetch(`/api/myagentmail/cadences/${cadenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setEnabled(next);
      toast.success(next ? "Sequence resumed" : "Sequence paused");
    } catch (err: any) {
      toast.error(`Failed to update: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/sequences"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sequences
        </Link>
        {cadenceId && enabled !== null ? (
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "success" : "outline"}>
              {enabled ? "active" : "paused"}
            </Badge>
            <Button variant="outline" size="sm" disabled={busy} onClick={toggle}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : enabled ? (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1.5" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Resume
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>
      <CadenceBuilder
        cadenceId={cadenceId}
        proxyUrl="/api/myagentmail"
        onSaved={(c: { id: string }) => {
          if (cadenceId == null) {
            router.replace(`/sequences/${c.id}`);
          } else {
            refreshStatus();
          }
        }}
        theme="light"
      />
    </div>
  );
}
