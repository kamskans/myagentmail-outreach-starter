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
import {
  draftConnectMessage,
  draftEngagementConnectMessage,
  draftJobChangeConnectMessage,
} from "@/lib/agent";

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

  type Classification = {
    engage: boolean;
    intent: "high" | "medium" | "low";
    reason: string;
  } | null;

  // Discriminated union over all three event types myagentmail emits.
  // Test pings short-circuit at the top.
  type EventEnvelope =
    | { type: "signal.match" | "signal.match.test"; signal: { id: string; name: string; query: string }; match: { id: string; foundAt: string }; post: { url: string; excerpt: string; postedAt: string | null }; author: { name: string; profileUrl: string; headline: string | null; role?: string | null; company?: string | null }; classification: Classification }
    | { type: "signal.engagement"; signal: { id: string; name: string; kind: "engagement" }; match: { id: string; foundAt: string }; target: { kind: "profile" | "company"; url: string; label: string | null }; post: { url: string; excerpt: string; postedAt: string | null }; engager: { name: string; profileUrl: string; headline: string | null; role: string | null; company: string | null; action: "commented" | "reacted"; commentText: string | null }; classification: Classification }
    | { type: "signal.job_change"; signal: { id: string; name: string; kind: "job_change_watchlist" }; match: { id: string; foundAt: string }; person: { name: string; profileUrl: string; headline: string | null }; change: { oldRole: string | null; oldCompany: string | null; newRole: string; newCompany: string }; classification: Classification };

  const event = JSON.parse(raw) as EventEnvelope;

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

  // Normalize per-event-type into a single shape we hand to the
  // drafter + the queue. Each branch picks the right fields, the
  // right drafter, and a one-line "why this fired" reasoning.
  let authorName = "";
  let profileUrl = "";
  let postUrl = "";
  let postExcerpt = "";
  let authorHeadline: string | null = null;
  let message = "";
  let reasoning = "";

  try {
    if (event.type === "signal.engagement") {
      authorName = event.engager.name || "";
      profileUrl = event.engager.profileUrl || "";
      postUrl = event.post.url || "";
      postExcerpt = event.post.excerpt || "";
      authorHeadline = event.engager.headline ?? null;
      message = await draftEngagementConnectMessage({
        authorName,
        authorHeadline: authorHeadline ?? undefined,
        trackedActorLabel: event.target.label || event.target.url,
        postExcerpt,
        engagerAction: event.engager.action,
        commentText: event.engager.commentText,
        signalName: event.signal.name,
      });
      reasoning = [
        `Engaged on ${event.target.label || event.target.url} (${event.engager.action})`,
        event.classification?.reason,
        event.classification ? `intent: ${event.classification.intent}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
    } else if (event.type === "signal.job_change") {
      authorName = event.person.name || "";
      profileUrl = event.person.profileUrl || "";
      authorHeadline = event.person.headline ?? null;
      // Synthesize a "post URL" for archival uniqueness; job changes
      // don't have a post.
      postUrl = `${profileUrl}#job-change=${encodeURIComponent(event.change.newRole)}@${encodeURIComponent(event.change.newCompany)}`;
      postExcerpt = `Job change: ${event.change.oldRole || "(unknown)"} @ ${event.change.oldCompany || "(unknown)"} → ${event.change.newRole} @ ${event.change.newCompany}`;
      message = await draftJobChangeConnectMessage({
        personName: authorName,
        oldRole: event.change.oldRole,
        oldCompany: event.change.oldCompany,
        newRole: event.change.newRole,
        newCompany: event.change.newCompany,
        signalName: event.signal.name,
      });
      reasoning = [
        `${event.change.oldRole || "?"} → ${event.change.newRole} at ${event.change.newCompany}`,
        event.classification?.reason,
        event.classification ? `intent: ${event.classification.intent}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
    } else {
      // Keyword match — original flow.
      authorName = event.author.name || "";
      profileUrl = event.author.profileUrl || "";
      postUrl = event.post.url || "";
      postExcerpt = event.post.excerpt || "";
      authorHeadline = event.author.headline ?? null;
      message = await draftConnectMessage({
        authorName,
        authorHeadline: authorHeadline ?? undefined,
        postExcerpt,
        signalName: event.signal.name,
      });
      reasoning = event.classification
        ? `${event.classification.reason} (intent: ${event.classification.intent})`
        : "";
    }
  } catch (err: any) {
    message = "(draft failed — " + String(err?.message || "").slice(0, 80) + ")";
  }

  // Archive the match — same row shape across all kinds (post_url is
  // synthetic for job_change but unique-per-match).
  db.prepare(
    `INSERT INTO signal_matches
      (signal_id, post_url, post_excerpt, author_name, author_profile_url, author_headline)
     VALUES (
       (SELECT id FROM signals WHERE name = ? LIMIT 1),
       ?, ?, ?, ?, ?
     )
     ON CONFLICT(signal_id, post_url) DO NOTHING`,
  ).run(
    event.signal.name,
    postUrl,
    postExcerpt.slice(0, 1200),
    authorName,
    profileUrl,
    authorHeadline,
  );

  const payload = {
    matchId: event.match.id,
    eventType: event.type,
    profileUrl,
    authorName,
    message,
    signalName: event.signal.name,
    postUrl,
    postExcerpt,
    classification: event.classification,
  };

  db.prepare(
    `INSERT INTO actions (type, payload, reasoning, status, signal_match_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("linkedin_connect", JSON.stringify(payload), reasoning, "pending", null);

  return NextResponse.json({ ok: true });
}
