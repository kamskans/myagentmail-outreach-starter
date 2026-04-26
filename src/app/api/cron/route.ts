/**
 * Cron entry point. Wire to Vercel Cron, GitHub Actions, or any scheduler.
 * Authenticated via the CRON_SECRET env var.
 *
 * Vercel Cron config (vercel.json):
 *   { "crons": [{ "path": "/api/cron", "schedule": "*\/15 * * * *" }] }
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron
 */

import { NextResponse } from "next/server";
import { runAllSignals } from "@/lib/signal-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summaries = await runAllSignals();
  return NextResponse.json({ ok: true, summaries });
}
