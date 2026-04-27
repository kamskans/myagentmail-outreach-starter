import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await sendMessage(params.id, body);
    return NextResponse.json(r);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
