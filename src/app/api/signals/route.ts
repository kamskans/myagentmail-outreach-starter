import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const SignalInput = z.object({
  name: z.string().min(1),
  query: z.string().min(1),
  enabled: z.boolean().default(true),
  intervalMinutes: z.number().int().positive().default(30),
  accountId: z.string().nullish(),
  actionType: z.enum(["linkedin_connect", "linkedin_dm", "email"]).default("linkedin_connect"),
  messageTemplate: z.string().nullish(),
});

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare<[], any>(
      `SELECT id, name, query, enabled, interval_minutes AS intervalMinutes,
              account_id AS accountId, action_type AS actionType,
              message_template AS messageTemplate, last_polled_at AS lastPolledAt,
              created_at AS createdAt
       FROM signals ORDER BY created_at DESC`,
    )
    .all();
  return NextResponse.json({ signals: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = SignalInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO signals
        (name, query, enabled, interval_minutes, account_id, action_type, message_template)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.name, d.query, d.enabled ? 1 : 0, d.intervalMinutes, d.accountId ?? null, d.actionType, d.messageTemplate ?? null);
  return NextResponse.json({ id: info.lastInsertRowid });
}
