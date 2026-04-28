/**
 * GET /api/leads/list
 *
 * Returns the unified leads queue. Optional query: ?status=new|reviewing|engaged|archived.
 * Default: all leads, newest first, capped at 200.
 */

import { NextResponse } from "next/server";
import { listLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 200);
  return NextResponse.json({ leads: listLeads({ status, limit }) });
}
