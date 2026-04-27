/**
 * Returns the historical matches for a single managed signal. Lets the
 * detail page render results without round-tripping every match through
 * the webhook (those still happen — this is the audit/debug view).
 */

import { NextResponse } from "next/server";
import { listManagedSignalMatches } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  try {
    const matches = await listManagedSignalMatches(params.id, { limit });
    return NextResponse.json({ matches });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
