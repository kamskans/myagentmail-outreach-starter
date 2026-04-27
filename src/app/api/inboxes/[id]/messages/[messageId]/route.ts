import { NextResponse } from "next/server";
import { getMessage, deleteMessage, replyMessage } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    const message = await getMessage(params.id, params.messageId);
    return NextResponse.json({ message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    await deleteMessage(params.id, params.messageId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// POST to /messages/:id is treated as a reply (matches MyAgentMail's
// /v1/inboxes/{id}/reply/{messageId} pattern).
export async function POST(
  req: Request,
  { params }: { params: { id: string; messageId: string } },
) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await replyMessage(params.id, params.messageId, body);
    return NextResponse.json(r);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
