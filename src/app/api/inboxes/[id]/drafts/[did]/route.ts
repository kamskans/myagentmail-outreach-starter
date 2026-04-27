import { NextResponse } from "next/server";
import { updateDraft, deleteDraft } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; did: string } },
) {
  const body = await req.json().catch(() => ({}));
  try {
    await updateDraft(params.id, params.did, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; did: string } },
) {
  try {
    await deleteDraft(params.id, params.did);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
