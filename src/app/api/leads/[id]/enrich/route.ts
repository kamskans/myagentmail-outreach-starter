/**
 * POST /api/leads/[id]/enrich
 *
 * Looks up the lead's likely work email via the configured enrichment
 * provider (RocketReach by default; see src/lib/enrichment.ts to swap)
 * and writes it onto the lead row. Idempotent — if an email is already
 * present, returns the existing one without paying for another lookup.
 *
 * Failure modes are explicit so the UI can show actionable messages:
 *   - 'unauthorized'        → ROCKETREACH_API_KEY not set
 *   - 'profile_not_found'   → provider can't find this LinkedIn URL
 *   - 'no_email_found'      → profile exists, no email surfaced
 *   - 'rate_limited'        → back off
 */

import { NextResponse } from "next/server";
import { getDb, getLead } from "@/lib/db";
import { enrichEmail } from "@/lib/enrichment";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = getLead(id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  if (lead.email) {
    return NextResponse.json({ email: lead.email, cached: true });
  }
  if (!lead.profileUrl) {
    return NextResponse.json(
      { error: "lead has no LinkedIn profile URL — cannot enrich" },
      { status: 400 },
    );
  }

  const result = await enrichEmail({
    profileUrl: lead.profileUrl,
    name: lead.name,
    company: lead.company,
  });

  if (result.status !== "ok") {
    return NextResponse.json(
      { status: result.status, error: result.detail ?? result.status },
      { status: result.status === "unauthorized" ? 401 : 422 },
    );
  }

  getDb()
    .prepare(`UPDATE new_leads SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(result.email, id);

  return NextResponse.json({
    email: result.email,
    confidence: result.confidence,
    cached: false,
  });
}
