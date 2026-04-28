/**
 * Webhook receiver for MyAgentMail intent signals.
 *
 * MyAgentMail signs every payload with HMAC-SHA256 using the per-signal
 * secret returned at signal creation. We verify the signature, dispatch
 * on event.type, and upsert one row per match into `new_leads`. The
 * unified leads queue is signal-kind-agnostic.
 */

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { upsertLeadFromMatch } from "@/lib/db";

export const dynamic = "force-dynamic";

type Classification = {
  engage: boolean;
  intent: "low" | "medium" | "high";
  reason: string;
} | null;

type EventEnvelope =
  | {
      type: "signal.match" | "signal.match.test";
      signal: { id: string; name: string; query: string };
      match: { id: string; foundAt: string };
      post: { url: string; excerpt: string; postedAt: string | null };
      author: {
        name: string;
        profileUrl: string;
        headline: string | null;
        role?: string | null;
        company?: string | null;
      };
      classification: Classification;
    }
  | {
      type: "signal.engagement";
      signal: { id: string; name: string; kind: "engagement" };
      match: { id: string; foundAt: string };
      target: { kind: "profile" | "company"; url: string; label: string | null };
      post: { url: string; excerpt: string; postedAt: string | null };
      engager: {
        name: string;
        profileUrl: string;
        headline: string | null;
        role: string | null;
        company: string | null;
        action: "commented" | "reacted";
        commentText: string | null;
      };
      classification: Classification;
    }
  | {
      type: "signal.job_change";
      signal: { id: string; name: string; kind: "job_change_watchlist" };
      match: { id: string; foundAt: string };
      person: { name: string; profileUrl: string; headline: string | null };
      change: {
        oldRole: string | null;
        oldCompany: string | null;
        newRole: string;
        newCompany: string;
      };
      classification: Classification;
    };

export async function POST(req: Request) {
  const secret = process.env.MYAGENTMAIL_WEBHOOK_SECRET;
  const raw = await req.text();

  if (secret) {
    const sig = req.headers.get("x-myagentmail-signature");
    if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 401 });
    const expected =
      "v1=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const ok =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  } else {
    console.warn(
      "[webhook] MYAGENTMAIL_WEBHOOK_SECRET unset — accepting unsigned payloads (dev only)",
    );
  }

  const event = JSON.parse(raw) as EventEnvelope;

  if (event.type === "signal.match.test") {
    return NextResponse.json({ ok: true, received: "test" });
  }

  if (event.type === "signal.engagement") {
    upsertLeadFromMatch({
      sourceKind: "engagement",
      sourceMatchId: event.match.id,
      sourceSignalId: event.signal.id,
      sourceSignalName: event.signal.name,
      profileUrl: event.engager.profileUrl,
      name: event.engager.name,
      role: event.engager.role,
      company: event.engager.company,
      headline: event.engager.headline,
      triggerPostUrl: event.post.url,
      triggerPostExcerpt: event.post.excerpt,
      triggerEngagerAction: event.engager.action,
      triggerEngagerComment: event.engager.commentText,
      classificationIntent: event.classification?.intent ?? null,
      classificationReason: event.classification?.reason ?? null,
    });
  } else if (event.type === "signal.job_change") {
    upsertLeadFromMatch({
      sourceKind: "job_change",
      sourceMatchId: event.match.id,
      sourceSignalId: event.signal.id,
      sourceSignalName: event.signal.name,
      profileUrl: event.person.profileUrl,
      name: event.person.name,
      role: event.change.newRole,
      company: event.change.newCompany,
      headline: event.person.headline,
      triggerJobChange: {
        oldRole: event.change.oldRole,
        oldCompany: event.change.oldCompany,
        newRole: event.change.newRole,
        newCompany: event.change.newCompany,
      },
      classificationIntent: event.classification?.intent ?? null,
      classificationReason: event.classification?.reason ?? null,
    });
  } else {
    // signal.match (keyword)
    upsertLeadFromMatch({
      sourceKind: "keyword",
      sourceMatchId: event.match.id,
      sourceSignalId: event.signal.id,
      sourceSignalName: event.signal.name,
      profileUrl: event.author.profileUrl,
      name: event.author.name,
      role: event.author.role ?? null,
      company: event.author.company ?? null,
      headline: event.author.headline,
      triggerPostUrl: event.post.url,
      triggerPostExcerpt: event.post.excerpt,
      classificationIntent: event.classification?.intent ?? null,
      classificationReason: event.classification?.reason ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
