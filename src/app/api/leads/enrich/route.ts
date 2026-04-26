import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as rr from "@/lib/rocketreach";

export async function POST(req: Request) {
  if (!rr.isEnabled()) {
    return NextResponse.json(
      { error: "RocketReach not configured. Set ROCKETREACH_API_KEY in .env." },
      { status: 503 },
    );
  }
  const body = await req.json().catch(() => ({} as any));
  const id = Number(body.leadId);
  const db = getDb();
  const lead = db
    .prepare<[number], any>(
      `SELECT id, name, email, linkedin_url AS linkedinUrl, company FROM leads WHERE id = ?`,
    )
    .get(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const found = await rr.lookupPerson({
    linkedinUrl: lead.linkedinUrl ?? undefined,
    email: lead.email ?? undefined,
    name: lead.name ?? undefined,
    currentEmployer: lead.company ?? undefined,
  });
  if (!found) {
    return NextResponse.json({ ok: false, error: "No match found" }, { status: 200 });
  }
  const email = found.emails?.find((e) => e.type === "professional")?.email ?? found.emails?.[0]?.email;
  db.prepare(
    `UPDATE leads SET name = COALESCE(?, name), email = COALESCE(?, email),
                       linkedin_url = COALESCE(?, linkedin_url),
                       company = COALESCE(?, company),
                       title = COALESCE(?, title),
                       enriched_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    found.name ?? null,
    email ?? null,
    found.linkedin_url ?? null,
    found.current_employer ?? null,
    found.current_title ?? null,
    id,
  );
  return NextResponse.json({ ok: true, lead: found });
}
