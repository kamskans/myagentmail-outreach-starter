import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dispatchAction } from "@/lib/action-runner";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({} as any));
  const action = body.action as "approve" | "reject";
  const db = getDb();
  const id = Number(params.id);

  if (action === "reject") {
    db.prepare(`UPDATE actions SET status = 'rejected', decided_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    db.prepare(`UPDATE actions SET status = 'approved', decided_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    try {
      await dispatchAction(id);
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  // Allow editing the message before approving
  const body = await req.json().catch(() => ({} as any));
  const db = getDb();
  const id = Number(params.id);
  const row = db
    .prepare<[number], { payload: string }>(`SELECT payload FROM actions WHERE id = ?`)
    .get(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = JSON.parse(row.payload);
  if (typeof body.message === "string") payload.message = body.message;
  if (typeof body.subject === "string") payload.subject = body.subject;
  if (typeof body.body === "string") payload.body = body.body;
  db.prepare(`UPDATE actions SET payload = ? WHERE id = ?`).run(JSON.stringify(payload), id);
  return NextResponse.json({ ok: true });
}
