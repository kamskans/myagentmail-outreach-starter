/**
 * POST /api/leads/[id]/send
 *
 * Body: { channel: 'linkedin' | 'email', from?: string, to?: string }
 * Fires the saved draft for the requested channel. For LinkedIn,
 * sends a connection request via MyAgentMail's /v1/linkedin/connections
 * to the lead's profile URL with the saved linkedinDraft as the note.
 * For email, posts to the chosen inbox's /send endpoint with the
 * saved subject + body.
 *
 * Marks the channel status = 'sent' on success.
 */

import { NextResponse } from "next/server";
import {
  getLead,
  getAgentConfig,
  updateLeadDraft,
  getDb,
} from "@/lib/db";
import { sendLinkedInConnect, sendMessage } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = getLead(id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  const body = await req.json().catch(() => ({} as any));
  const channel = body?.channel as "linkedin" | "email" | undefined;
  if (channel !== "linkedin" && channel !== "email") {
    return NextResponse.json({ error: "channel must be 'linkedin' or 'email'" }, { status: 400 });
  }

  if (channel === "linkedin") {
    if (!lead.profileUrl) {
      return NextResponse.json({ error: "lead has no profile URL" }, { status: 400 });
    }
    if (!lead.linkedinDraft || lead.linkedinDraft.trim().length === 0) {
      return NextResponse.json({ error: "no draft — call /draft first" }, { status: 400 });
    }
    try {
      const r = await sendLinkedInConnect({
        target: lead.profileUrl,
        message: lead.linkedinDraft,
      });
      if (!r?.ok) {
        return NextResponse.json(
          { error: r?.error ?? "LinkedIn send failed" },
          { status: 502 },
        );
      }
      updateLeadDraft(id, {
        linkedinStatus: "sent",
        linkedinSentAt: new Date().toISOString(),
        status: "engaged",
      });
      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? "send failed" }, { status: 502 });
    }
  }

  // channel === 'email'
  if (!lead.emailDraftSubject || !lead.emailDraftBody) {
    return NextResponse.json({ error: "no draft — call /draft first" }, { status: 400 });
  }
  const to = String(body?.to ?? lead.email ?? "").trim();
  if (!to) {
    return NextResponse.json(
      { error: "recipient email missing — pass `to` or enrich the lead first" },
      { status: 400 },
    );
  }

  // Pick the first inbox we have configured. The starter assumes a
  // single sending inbox; multi-inbox routing is a v2 concern.
  const cfg = getAgentConfig();
  void cfg;
  const inboxRow = getDb()
    .prepare(`SELECT id FROM inboxes ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined;
  const inboxId = body?.from || inboxRow?.id;
  if (!inboxId) {
    return NextResponse.json(
      { error: "no inbox configured — visit /inboxes to provision one" },
      { status: 400 },
    );
  }

  try {
    const sendResult = await sendMessage(inboxId, {
      to,
      subject: lead.emailDraftSubject,
      plainBody: lead.emailDraftBody,
    });
    updateLeadDraft(id, {
      emailStatus: "sent",
      emailSentAt: new Date().toISOString(),
      emailThreadId: (sendResult as any)?.threadId ?? null,
      status: "engaged",
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "send failed" }, { status: 502 });
  }
}
