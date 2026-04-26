import { NextResponse } from "next/server";
import { listInboxes } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const inboxes = await listInboxes();
    return NextResponse.json({ inboxes });
  } catch (err: any) {
    return NextResponse.json({ inboxes: [], error: err.message }, { status: 200 });
  }
}
