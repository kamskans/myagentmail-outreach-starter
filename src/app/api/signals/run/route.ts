/**
 * Manual "run now" trigger — same as the cron endpoint but no auth required
 * because it can only be hit from the dashboard's same origin.
 */
import { NextResponse } from "next/server";
import { runAllSignals } from "@/lib/signal-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const summaries = await runAllSignals();
  return NextResponse.json({ ok: true, summaries });
}
