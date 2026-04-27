import { NextResponse } from "next/server";
import { sendDraft } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string; did: string } },
) {
  try {
    const r = await sendDraft(params.id, params.did);
    return NextResponse.json(r);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
