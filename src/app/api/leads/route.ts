import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const LeadInput = z.object({
  name: z.string().nullish(),
  email: z.string().email().nullish(),
  linkedinUrl: z.string().url().nullish(),
  company: z.string().nullish(),
  title: z.string().nullish(),
  source: z.string().nullish(),
});

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare<[], any>(
      `SELECT id, name, email, linkedin_url AS linkedinUrl, company, title,
              source, enriched_at AS enrichedAt, created_at AS createdAt
       FROM leads ORDER BY created_at DESC LIMIT 500`,
    )
    .all();
  return NextResponse.json({ leads: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = LeadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const d = parsed.data;
  const db = getDb();
  try {
    const info = db
      .prepare(
        `INSERT INTO leads (name, email, linkedin_url, company, title, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(d.name ?? null, d.email ?? null, d.linkedinUrl ?? null, d.company ?? null, d.title ?? null, d.source ?? "manual");
    return NextResponse.json({ id: info.lastInsertRowid });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
