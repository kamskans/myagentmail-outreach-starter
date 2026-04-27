import { NextResponse } from "next/server";
import { listMessages } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const direction = url.searchParams.get("direction") as "inbound" | "outbound" | null;
  const limit = Number(url.searchParams.get("limit") ?? 100);
  try {
    const messages = await listMessages(params.id, {
      direction: direction || undefined,
      limit,
    });
    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
