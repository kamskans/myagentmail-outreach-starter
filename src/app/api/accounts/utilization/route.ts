/**
 * Proxy: per-session quota usage in the trailing 24h.
 * Drives the "Today's utilization" tile on /accounts.
 */

import { NextResponse } from "next/server";
import { getSessionUtilization } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSessionUtilization();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
