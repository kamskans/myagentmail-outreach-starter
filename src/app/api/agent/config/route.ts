/**
 * GET  /api/agent/config — returns the current AgentConfig.
 * POST /api/agent/config — partial update. Used by the onboarding
 *                          wizard's "Save and continue" buttons and
 *                          the post-launch settings page.
 */

import { NextResponse } from "next/server";
import { getAgentConfig, saveAgentConfig } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: getAgentConfig() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const config = saveAgentConfig(body);
  return NextResponse.json({ config });
}
