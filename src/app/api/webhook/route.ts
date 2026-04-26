/**
 * Webhook receiver for MyAgentMail LinkedIn intent signals.
 *
 * Configure your managed signal's webhook URL to point at this route.
 * MyAgentMail signs every payload with HMAC-SHA256 using the per-signal
 * secret returned at creation time — store it in MYAGENTMAIL_WEBHOOK_SECRET
 * and we'll verify the signature here before queuing the match for
 * approval.
 *
 * The agent then drafts a personalized connection note and the match
 * lands in /queue for you to approve.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { draftConnectMessage } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.MYAGENTMAIL_WEBHOOK_SECRET;
  const raw = await req.text();

  // Signature verification — the secret is whsec_… returned when the
  // signal was created. Skip with a warning if unset (dev only).
  if (secret) {
    const sig = req.headers.get("x-myagentmail-signature");
    if (!sig) {
      return NextResponse.json({ error: "missing signature" }, { status: 401 });
    }
    const expected =
      "v1=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  } else {
    console.warn("[webhook] MYAGENTMAIL_WEBHOOK_SECRET unset — accepting unsigned payloads (dev only)");
  }

  const event = JSON.parse(raw) as {
    type: "signal.match" | "signal.match.test";
    signal: { id: string; name: string; query: string };
    match: { id: string; foundAt: string };
    post: { url: string; excerpt: string; postedAt: string | null };
    author: { name: string; profileUrl: string; headline: string | null };
    classification: { engage: boolean; intent: "high" | "medium" | "low"; reason: string } | null;
  };

  if (event.type === "signal.match.test") {
    return NextResponse.json({ ok: true, received: "test" });
  }

  const db = getDb();

  // Idempotency — if we've already received this match, just ack.
  const existing = db
    .prepare<[string], { id: number }>(
      `SELECT id FROM actions WHERE json_extract(payload, '$.matchId') = ?`,
    )
    .get(event.match.id);
  if (existing) return NextResponse.json({ ok: true, deduped: true });

  // Insert a signal_match (for archival) and an action (for the queue).
  const matchInfo = db
    .prepare(
      `INSERT INTO signal_matches
        (signal_id, post_url, post_excerpt, author_name, author_profile_url, author_headline)
       VALUES (
         (SELECT id FROM signals WHERE name = ? LIMIT 1),
         ?, ?, ?, ?, ?
       )
       ON CONFLICT(signal_id, post_url) DO NOTHING`,
    )
    .run(
      event.signal.name,
      event.post.url,
      (event.post.excerpt || "").slice(0, 1200),
      event.author.name || "",
      event.author.profileUrl || "",
      event.author.headline ?? null,
    );

  // Draft a personalized message
  let message = "";
  try {
    message = await draftConnectMessage({
      authorName: event.author.name || "",
      authorHeadline: event.author.headline ?? undefined,
      postExcerpt: event.post.excerpt || "",
      signalName: event.signal.name,
    });
  } catch (err: any) {
    message = "(draft failed — " + String(err?.message || "").slice(0, 80) + ")";
  }

  const payload = {
    matchId: event.match.id,
    profileUrl: event.author.profileUrl,
    authorName: event.author.name,
    message,
    signalName: event.signal.name,
    postUrl: event.post.url,
    postExcerpt: event.post.excerpt,
    classification: event.classification,
  };

  const reasoning = event.classification
    ? `${event.classification.reason} (intent: ${event.classification.intent})`
    : "";

  db.prepare(
    `INSERT INTO actions (type, payload, reasoning, status, signal_match_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("linkedin_connect", JSON.stringify(payload), reasoning, "pending", null);

  return NextResponse.json({ ok: true });
}
