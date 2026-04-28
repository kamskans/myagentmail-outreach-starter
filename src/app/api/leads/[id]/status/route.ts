/**
 * POST /api/leads/[id]/status
 * Body: { status: 'new' | 'reviewing' | 'engaged' | 'archived' }
 * Manual lifecycle control from the UI.
 */

import { NextResponse } from "next/server";
import { getLead, updateLeadDraft } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!getLead(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({} as any));
  const status = body?.status;
  if (!["new", "reviewing", "engaged", "archived"].includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  updateLeadDraft(id, { status });
  return NextResponse.json({ ok: true });
}
