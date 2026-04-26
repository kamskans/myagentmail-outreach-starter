import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const db = getDb();
  const where = status ? `WHERE a.status = ?` : "";
  const params = status ? [status] : [];
  const rows = db
    .prepare<any[], any>(
      `SELECT a.id, a.type, a.payload, a.reasoning, a.status, a.result,
              a.created_at AS createdAt, a.decided_at AS decidedAt, a.sent_at AS sentAt,
              sm.post_url AS postUrl, sm.author_name AS authorName,
              sm.author_headline AS authorHeadline, sm.post_excerpt AS postExcerpt,
              s.name AS signalName
       FROM actions a
       LEFT JOIN signal_matches sm ON sm.id = a.signal_match_id
       LEFT JOIN signals s ON s.id = sm.signal_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT 200`,
    )
    .all(...params);
  return NextResponse.json({
    actions: rows.map((r: any) => ({ ...r, payload: JSON.parse(r.payload) })),
  });
}
