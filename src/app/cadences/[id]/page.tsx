"use client";

/**
 * Cadence editor — renders the <CadenceBuilder /> widget from
 * @myagentmail/react. The widget handles step list, kind picker
 * (LinkedIn invite/DM, email, wait), per-step delay, branch conditions
 * (after_accept, no_reply_to_prev, never_replied), and AI-or-static
 * draft strategy. It POSTs to /api/myagentmail/cadences* via the
 * mamProxyHandler we wire in /api/myagentmail/[...path]/route.ts.
 *
 * Route params:
 *   /cadences/new     → cadenceId={null} (create flow)
 *   /cadences/<id>    → cadenceId="<id>" (load + edit existing)
 */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CadenceBuilder } from "@myagentmail/react";

export default function CadenceEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = params?.id;
  const cadenceId = !id || id === "new" ? null : id;

  return (
    <div className="space-y-4">
      <Link
        href="/cadences"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to cadences
      </Link>
      <CadenceBuilder
        cadenceId={cadenceId}
        proxyUrl="/api/myagentmail"
        onSaved={(c: { id: string }) => {
          if (cadenceId == null) {
            router.replace(`/cadences/${c.id}`);
          }
        }}
        theme="light"
      />
    </div>
  );
}
