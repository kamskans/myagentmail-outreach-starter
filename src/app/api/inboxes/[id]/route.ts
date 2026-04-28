/**
 * DELETE /api/inboxes/[id] — deprovision a single inbox.
 */

import { NextResponse } from "next/server";
import { deleteInbox } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteInbox(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "delete failed" }, { status: 502 });
  }
}
