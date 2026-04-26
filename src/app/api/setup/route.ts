/**
 * Setup status — returns what's configured vs missing. The /setup page
 * polls this on first load to drive a checklist.
 */

import { NextResponse } from "next/server";
import { listInboxes, listLinkedInSessions } from "@/lib/myagentmail";
import { getDb } from "@/lib/db";
import { isEnabled as rocketReachEnabled } from "@/lib/rocketreach";

export const dynamic = "force-dynamic";

export async function GET() {
  const status: Record<string, any> = {
    myAgentMail: { configured: !!process.env.MYAGENTMAIL_API_KEY },
    openAi: { configured: !!process.env.OPENAI_API_KEY },
    cron: { configured: !!process.env.CRON_SECRET },
    rocketReach: { configured: rocketReachEnabled() },
    approvalMode: process.env.APPROVAL_MODE || "manual",
    inboxes: { count: 0, primary: null as string | null },
    linkedInAccounts: { count: 0 },
    signals: { count: 0, enabled: 0 },
  };

  if (status.myAgentMail.configured) {
    try {
      const inboxes = await listInboxes();
      status.inboxes.count = inboxes.length;
      if (inboxes[0]) status.inboxes.primary = inboxes[0].email;
    } catch (err: any) {
      status.myAgentMail.error = err.message;
    }
    try {
      const sessions = await listLinkedInSessions();
      status.linkedInAccounts.count = sessions.length;
    } catch {
      // LinkedIn module may not be enabled — non-fatal
    }
  }

  try {
    const db = getDb();
    const row = db
      .prepare<[], { count: number; enabled: number }>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(enabled), 0) AS enabled FROM signals`,
      )
      .get();
    if (row) {
      status.signals.count = row.count;
      status.signals.enabled = row.enabled;
    }
  } catch (err: any) {
    status.signals.error = err.message;
  }

  return NextResponse.json(status);
}

export async function POST(req: Request) {
  // Bootstrap action: create the default inbox via MyAgentMail.
  const body = await req.json().catch(() => ({} as any));
  const username = String(body.username || process.env.MYAGENTMAIL_DEFAULT_INBOX || "scout");
  const { ensureInbox } = await import("@/lib/myagentmail");
  const inbox = await ensureInbox(username);
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO inboxes (id, email, display_name) VALUES (?, ?, ?)`,
  ).run(inbox.id, inbox.email, inbox.displayName ?? null);
  return NextResponse.json({ ok: true, inbox });
}
