/**
 * Agent reasoning layer — every LLM call the starter makes goes through
 * here so prompts are single-sourced and easy to fork.
 *
 * Operations:
 *   - inferIcpFromWebsite      — onboarding step 1's "AI-generated"
 *                                pre-fill. Pulls the user's site, asks
 *                                an LLM to infer target ICP + suggested
 *                                keywords, competitors, influencers.
 *   - draftFiringRule          — turns the agent_config into the
 *                                plain-English rule we hand to MyAgentMail
 *                                when creating signals.
 *   - draftLinkedInMessage     — channel-specific opener for a lead.
 *                                Branches on signal kind (keyword post /
 *                                engagement / job change) — different
 *                                triggers warrant different openers.
 *   - draftColdEmail           — subject + body for cold email outreach.
 *                                Uses pain points + campaign goal + tone.
 */

import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

const MODEL_ID = process.env.OPENAI_MODEL || "gpt-5.4-nano-2026-03-17";

/* ── ICP inference from website URL ──────────────────────────────────── */

const IcpInference = z.object({
  companyName: z.string(),
  productPitch: z
    .string()
    .describe("One sentence summary of what this company does and for whom."),
  targetJobTitles: z.array(z.string()).max(8),
  targetIndustries: z.array(z.string()).max(6),
  targetLocations: z.array(z.string()).max(4),
  targetCompanySizes: z
    .array(z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"]))
    .max(4),
  targetCompanyTypes: z
    .array(z.enum(["Startup", "Private Company", "Public Company", "Agency", "Nonprofit"]))
    .max(3),
  excludeCompanies: z
    .array(z.string())
    .max(8)
    .describe("Common platforms/marketplaces/competitors to filter OUT of leads."),
  trackKeywords: z
    .array(z.string())
    .max(6)
    .describe(
      "Specific phrases people would post on LinkedIn when expressing the pain this product solves. Quoted phrases work best.",
    ),
  trackCompanies: z
    .array(z.string())
    .max(4)
    .describe(
      "LinkedIn URLs (https://www.linkedin.com/company/<slug>/) of direct competitors whose engagers are likely ICP. Best guess. User reviews.",
    ),
  trackProfiles: z
    .array(z.string())
    .max(4)
    .describe(
      "LinkedIn profile URLs (https://www.linkedin.com/in/<slug>/) of niche-relevant creators/influencers whose engagers are likely ICP. Best guess.",
    ),
  painPoints: z
    .string()
    .describe("3-5 short bullet lines on the pain this product solves for its ICP."),
});

export type InferredIcp = z.infer<typeof IcpInference>;

export async function inferIcpFromWebsite(websiteUrl: string): Promise<InferredIcp> {
  // Fetch the site (best-effort; LLM can still infer from URL alone).
  let pageText = "";
  try {
    const r = await fetch(websiteUrl, {
      headers: { "User-Agent": "MyAgentMail-Starter/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (r.ok) {
      const html = await r.text();
      // Strip tags, collapse whitespace, cap to keep token count reasonable.
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 12_000);
    }
  } catch {
    /* site unreachable — fall through to URL-only inference */
  }

  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: IcpInference,
    system:
      "You are a senior B2B GTM strategist setting up an outbound campaign. Given a company's website, infer their ideal customer profile and the specific intent signals worth monitoring on LinkedIn. Be specific. Avoid generic answers like 'all SaaS companies' or 'all founders'. Quote real phrases people in the ICP would actually post.",
    prompt: `Website: ${websiteUrl}

Site content (truncated):
"""
${pageText || "(could not fetch site; infer from URL alone)"}
"""

Infer the ICP and the specific buying-intent signals to monitor. Be opinionated — the user will review and edit. For trackKeywords, suggest phrases people post when in pain (e.g., "outbound is broken", "looking for VA"), not generic SEO terms. For trackCompanies, name actual competitors. For trackProfiles, name niche creators whose audience is the ICP.`,
  });

  return object;
}

/* ── Firing-rule generator ──────────────────────────────────────────── */

/**
 * Build the plain-English firing rule that MyAgentMail's classifier
 * uses as authoritative. Combines ICP fields into inclusion + exclusion
 * criteria. Precision toggle determines how strict the rule is.
 */
export function draftFiringRule(input: {
  productPitch: string;
  targetJobTitles: string[];
  targetIndustries: string[];
  targetCompanySizes: string[];
  excludeCompanies: string[];
  painPoints: string;
  precision: "discovery" | "high";
}): string {
  const titles = input.targetJobTitles.length
    ? input.targetJobTitles.join(", ")
    : "operators or decision-makers";
  const industries = input.targetIndustries.length
    ? input.targetIndustries.join(", ")
    : "any";
  const sizes = input.targetCompanySizes.length
    ? input.targetCompanySizes.join(" / ")
    : "any size";
  const excludes = input.excludeCompanies.length
    ? input.excludeCompanies.join(", ")
    : "agencies, recruiters, and obvious vendor accounts";
  const strictness =
    input.precision === "high"
      ? "Be strict — only flag people who clearly match all criteria. Skip ambiguous cases."
      : "Be permissive — flag anyone who plausibly matches; we're in discovery mode.";

  return [
    `Flag people who are ${titles} at ${industries} companies (sizes ${sizes}).`,
    input.painPoints
      ? `They likely have one of these pains:\n${input.painPoints.trim()}`
      : `Product context: ${input.productPitch}`,
    `Skip ${excludes}. Skip recruiters posting job ads. Skip vendors selling competing services.`,
    strictness,
  ].join("\n\n");
}

/* ── LinkedIn message drafter ───────────────────────────────────────── */

export type LeadContext = {
  name: string | null;
  role: string | null;
  company: string | null;
  headline: string | null;
  sourceKind: "keyword" | "engagement" | "job_change" | "manual";
  sourceSignalName: string | null;
  triggerPostExcerpt: string | null;
  triggerEngagerAction: "commented" | "reacted" | null;
  triggerEngagerComment: string | null;
  triggerJobChange: {
    oldRole: string | null;
    oldCompany: string | null;
    newRole: string | null;
    newCompany: string | null;
  } | null;
};

export type AgentVoice = {
  productPitch: string;
  painPoints: string;
  campaignGoal: string;
  messageTone: "professional" | "conversational" | "direct";
};

const TONE_GUIDE: Record<AgentVoice["messageTone"], string> = {
  professional: "Tone: warm, specific, professional. No exclamation points. No emoji.",
  conversational: "Tone: friendly, casual, low-pressure. One emoji at most if it fits naturally.",
  direct: "Tone: bold, confident, no fluff. Get to the point in the first sentence.",
};

export async function draftLinkedInMessage(
  lead: LeadContext,
  voice: AgentVoice,
): Promise<string> {
  // Build context block per signal kind — different triggers warrant
  // different openers.
  let triggerBlock = "";
  if (lead.sourceKind === "engagement") {
    triggerBlock = lead.triggerEngagerComment
      ? `They ${lead.triggerEngagerAction} on a post tracked by your "${lead.sourceSignalName}" signal. Their verbatim comment:\n"${lead.triggerEngagerComment}"\n\nQuote or paraphrase their comment in your opener — it shows you read it.`
      : `They reacted to a post tracked by your "${lead.sourceSignalName}" signal. ${lead.triggerPostExcerpt ? `Original post excerpt: "${lead.triggerPostExcerpt}"` : ""}`;
  } else if (lead.sourceKind === "job_change" && lead.triggerJobChange) {
    triggerBlock = `They just changed roles: ${lead.triggerJobChange.oldRole || "?"} at ${lead.triggerJobChange.oldCompany || "?"} → ${lead.triggerJobChange.newRole} at ${lead.triggerJobChange.newCompany}. Reference the move specifically — do NOT say "congrats on the new role!" generically.`;
  } else if (lead.sourceKind === "keyword") {
    triggerBlock = `They posted on LinkedIn matching your "${lead.sourceSignalName}" watcher. Excerpt:\n"${lead.triggerPostExcerpt || ""}"\n\nReference one specific detail from their post.`;
  }

  const { text } = await generateText({
    model: openai(MODEL_ID),
    system: `You write LinkedIn connection request notes for warm outbound. Hard limit: 280 characters. Open with first name. Reference one concrete trigger from the context. Do NOT pitch the product. End with a low-friction question or a simple introduction. Plain text. ${TONE_GUIDE[voice.messageTone]}`,
    prompt: `Lead: ${lead.name || "(unknown)"}${lead.role ? `, ${lead.role}` : ""}${lead.company ? ` at ${lead.company}` : ""}${lead.headline ? ` — ${lead.headline}` : ""}

What we do: ${voice.productPitch}

Why we noticed them:
${triggerBlock}

Write the connection note. Output ONLY the message text, no preamble.`,
  });

  return text.trim().slice(0, 280);
}

/* ── Cold email drafter ─────────────────────────────────────────────── */

export type ColdEmailDraft = {
  subject: string;
  body: string;
};

const ColdEmailSchema = z.object({
  subject: z.string().describe("Email subject line. Max 60 chars. No clickbait."),
  body: z.string().describe("Email body. Markdown not allowed. Plain text only."),
});

export async function draftColdEmail(
  lead: LeadContext,
  voice: AgentVoice,
): Promise<ColdEmailDraft> {
  // Same trigger context construction as LinkedIn, but emails are
  // longer and CAN talk about the product.
  let triggerBlock = "";
  if (lead.sourceKind === "engagement") {
    triggerBlock = lead.triggerEngagerComment
      ? `They commented on a post tracked by the "${lead.sourceSignalName}" signal. Their words: "${lead.triggerEngagerComment}"`
      : `They reacted to a post tracked by the "${lead.sourceSignalName}" signal.${lead.triggerPostExcerpt ? ` Post: "${lead.triggerPostExcerpt}"` : ""}`;
  } else if (lead.sourceKind === "job_change" && lead.triggerJobChange) {
    triggerBlock = `They just moved from ${lead.triggerJobChange.oldRole || "?"} at ${lead.triggerJobChange.oldCompany || "?"} to ${lead.triggerJobChange.newRole} at ${lead.triggerJobChange.newCompany}.`;
  } else if (lead.sourceKind === "keyword") {
    triggerBlock = `They posted on LinkedIn: "${lead.triggerPostExcerpt || ""}" — matched our "${lead.sourceSignalName}" watcher.`;
  }

  const goalGuide: Record<string, string> = {
    connect: "Goal: start a conversation. End with a low-pressure question; no calendar link.",
    book_demo: "Goal: book a 15-min demo. End with a specific calendar prompt.",
  };

  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: ColdEmailSchema,
    system: `You write cold outbound emails. Constraints:
- Subject: 4-7 words, lowercase except proper nouns, no clickbait, no emoji.
- Body: 3 short paragraphs MAX. Plain text. No markdown. No bullet lists.
- Para 1: trigger reference (one specific thing from context). Open with first name.
- Para 2: relevance — connect their pain to what we do. ONE sentence. No bullet lists.
- Para 3: one-line CTA per the campaign goal.
${TONE_GUIDE[voice.messageTone]}
${goalGuide[voice.campaignGoal] || goalGuide.connect}`,
    prompt: `Lead: ${lead.name || "(unknown)"}${lead.role ? `, ${lead.role}` : ""}${lead.company ? ` at ${lead.company}` : ""}${lead.headline ? ` — ${lead.headline}` : ""}

What we do: ${voice.productPitch}

Pains we solve:
${voice.painPoints || "(no pain points configured)"}

Why we noticed this lead:
${triggerBlock}

Write the email. Subject + body only.`,
  });

  return object;
}
