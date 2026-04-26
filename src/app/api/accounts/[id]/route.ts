import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { linkedInRevokeSession } from "@/lib/myagentmail";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const row = db
    .prepare<[string], { session_id: string }>(
      `SELECT session_id FROM linkedin_accounts WHERE id = ?`,
    )
    .get(params.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await linkedInRevokeSession(row.session_id);
  } catch {}
  db.prepare(`DELETE FROM linkedin_accounts WHERE id = ?`).run(params.id);
  return NextResponse.json({ ok: true });
}
