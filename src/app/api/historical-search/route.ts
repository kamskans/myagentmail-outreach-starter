/**
 * Thin proxy over MyAgentMail's /v1/linkedin/searches endpoint. The
 * starter holds no search state locally — MyAgentMail persists each
 * search + its results so the UI can re-open one without spending
 * another LinkedIn quota.
 */

import { NextResponse } from "next/server";
import {
  runHistoricalSearch,
  listHistoricalSearches,
  listLinkedInSessions,
} from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [searches, sessions] = await Promise.all([
      listHistoricalSearches({ limit: 50 }),
      listLinkedInSessions().catch(() => []),
    ]);
    return NextResponse.json({ searches, sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  try {
    const data = await runHistoricalSearch(body);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
