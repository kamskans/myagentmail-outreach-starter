/**
 * After <LinkedInConnect /> finishes the connection on MyAgentMail,
 * the widget calls onConnected({ sessionId, label, ... }). We mirror
 * that into the local SQLite `linkedin_accounts` table so the starter
 * UI can list connected accounts without re-fetching from MyAgentMail.
 *
 * Idempotent — if the same sessionId is tracked twice, the second
 * call is a no-op.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  label: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { sessionId, label } = parsed.data;
  const db = getDb();

  const existing = db
    .prepare<[string], { id: string }>(
      `SELECT id FROM linkedin_accounts WHERE session_id = ? LIMIT 1`,
    )
    .get(sessionId);

  if (existing) {
    return NextResponse.json({ ok: true, accountId: existing.id, alreadyTracked: true });
  }

  const id = `acct_${Date.now().toString(36)}`;
  db.prepare(
    `INSERT INTO linkedin_accounts (id, label, session_id, status) VALUES (?, ?, ?, 'active')`,
  ).run(id, label || "LinkedIn account", sessionId);

  return NextResponse.json({ ok: true, accountId: id });
}
