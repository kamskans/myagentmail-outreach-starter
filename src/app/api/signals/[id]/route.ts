import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({} as any));
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof body.enabled === "boolean") {
    fields.push("enabled = ?");
    values.push(body.enabled ? 1 : 0);
  }
  if (typeof body.intervalMinutes === "number") {
    fields.push("interval_minutes = ?");
    values.push(body.intervalMinutes);
  }
  if (typeof body.accountId === "string" || body.accountId === null) {
    fields.push("account_id = ?");
    values.push(body.accountId);
  }
  if (typeof body.messageTemplate === "string" || body.messageTemplate === null) {
    fields.push("message_template = ?");
    values.push(body.messageTemplate);
  }
  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(Number(params.id));
  db.prepare(`UPDATE signals SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare(`DELETE FROM signals WHERE id = ?`).run(Number(params.id));
  return NextResponse.json({ ok: true });
}
