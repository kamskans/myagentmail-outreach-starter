/**
 * POST /api/leads/[id]/draft
 *
 * Body: { channel: 'linkedin' | 'email' }
 * Generates a fresh draft for the requested channel using the agent's
 * voice config (pain points + tone + campaign goal). Writes the draft
 * onto the lead row and marks the channel status = 'drafted'.
 */

import { NextResponse } from "next/server";
import { getLead, getAgentConfig, updateLeadDraft } from "@/lib/db";
import { draftLinkedInMessage, draftColdEmail, type LeadContext } from "@/lib/agent";

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

  const cfg = getAgentConfig();
  if (!cfg.productPitch) {
    return NextResponse.json(
      { error: "Agent config incomplete — finish onboarding first." },
      { status: 400 },
    );
  }

  const ctx: LeadContext = {
    name: lead.name,
    role: lead.role,
    company: lead.company,
    headline: lead.headline,
    sourceKind: lead.sourceKind,
    sourceSignalName: lead.sourceSignalName,
    triggerPostExcerpt: lead.triggerPostExcerpt,
    triggerEngagerAction: lead.triggerEngagerAction,
    triggerEngagerComment: lead.triggerEngagerComment,
    triggerJobChange: lead.triggerJobChange,
  };
  const voice = {
    productPitch: cfg.productPitch,
    painPoints: cfg.painPoints,
    campaignGoal: cfg.campaignGoal,
    messageTone: cfg.messageTone,
  };

  try {
    if (channel === "linkedin") {
      const text = await draftLinkedInMessage(ctx, voice);
      updateLeadDraft(id, { linkedinDraft: text, linkedinStatus: "drafted" });
      return NextResponse.json({ channel, draft: text });
    } else {
      const draft = await draftColdEmail(ctx, voice);
      updateLeadDraft(id, {
        emailDraftSubject: draft.subject,
        emailDraftBody: draft.body,
        emailStatus: "drafted",
      });
      return NextResponse.json({ channel, draft });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "draft failed" }, { status: 500 });
  }
}
