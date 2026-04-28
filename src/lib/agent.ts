/**
 * Lightweight agent decision layer.
 *
 * Two operations:
 * 1. classifySignal — given a LinkedIn post that matched a keyword, decide
 *    whether it's worth engaging with (filters out obvious noise).
 * 2. draftConnectMessage — write a 280-char personalized note.
 * 3. draftEmail — write a short cold email tied to the signal context.
 *
 * Uses Vercel AI SDK + OpenAI by default. Bring-your-own key.
 */

import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";

const MODEL_ID = process.env.OPENAI_MODEL || "gpt-4o-mini";

const ClassifyResult = z.object({
  engage: z.boolean().describe("Should we reach out to this person?"),
  reason: z.string().describe("One sentence explaining the decision."),
  intent: z
    .enum(["high", "medium", "low"])
    .describe("How strong the buying intent / relevance signal is."),
});

export async function classifySignal(input: {
  signalName: string;
  query: string;
  postExcerpt: string;
  authorName: string;
  authorHeadline?: string;
}): Promise<z.infer<typeof ClassifyResult>> {
  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: ClassifyResult,
    system:
      "You are evaluating LinkedIn posts to decide whether they represent a real buying-intent signal worth a personal outreach. Skip generic motivational posts, content reposts, recruiter spam, or posts unrelated to the watched topic. Only engage when the author is plausibly interested in or struggling with the topic the watcher is set up for.",
    prompt: `Watcher: "${input.signalName}" (keyword: ${input.query})

Author: ${input.authorName}${input.authorHeadline ? ` — ${input.authorHeadline}` : ""}

Post:
"""
${input.postExcerpt}
"""

Decide whether to engage.`,
  });
  return object;
}

export async function draftConnectMessage(input: {
  authorName: string;
  authorHeadline?: string;
  postExcerpt: string;
  signalName: string;
  productPitch?: string;
}): Promise<string> {
  const { text } = await generateText({
    model: openai(MODEL_ID),
    system:
      "You write LinkedIn connection request notes. Hard limit: 280 characters. Tone: warm, specific, never salesy. Reference one concrete detail from their post. Do not pitch a product. Open with their first name. End with a low-friction question or just an introduction. Plain text, no emoji unless the post used one.",
    prompt: `Their post:
"""
${input.postExcerpt}
"""

Author: ${input.authorName}${input.authorHeadline ? ` (${input.authorHeadline})` : ""}
Why we noticed them: matched our "${input.signalName}" watcher.${
      input.productPitch ? `\nWhat we do: ${input.productPitch}` : ""
    }

Write the note. Output ONLY the message text, no preamble.`,
  });
  return text.trim().slice(0, 280);
}

/**
 * Engagement-signal drafter — write a connection note that quotes the
 * engager's verbatim comment back at them. This is the killer
 * personalization angle: "Saw your comment on Acme's post about X —
 * here's how we approached the same thing."
 */
export async function draftEngagementConnectMessage(input: {
  authorName: string;
  authorHeadline?: string;
  trackedActorLabel: string;
  postExcerpt: string;
  engagerAction: "commented" | "reacted";
  commentText: string | null;
  signalName: string;
  productPitch?: string;
}): Promise<string> {
  const { text } = await generateText({
    model: openai(MODEL_ID),
    system:
      "You write LinkedIn connection request notes for warm-lead outreach. Hard limit: 280 characters. Tone: warm, specific, never salesy. The engager just commented on or reacted to a post by a third party we're tracking — quote or paraphrase their comment when present. Open with first name. End with a low-friction question or simple introduction. Plain text. No emoji unless the engager used one in their comment.",
    prompt: `We're tracking posts by: ${input.trackedActorLabel}
Post excerpt: """
${input.postExcerpt || "(post body not captured)"}
"""

Engager: ${input.authorName}${input.authorHeadline ? ` (${input.authorHeadline})` : ""}
Action: ${input.engagerAction}${input.commentText ? `\nTheir comment: "${input.commentText}"` : ""}

Why we noticed them: matched our "${input.signalName}" engagement watcher.${
      input.productPitch ? `\nWhat we do: ${input.productPitch}` : ""
    }

Write a connection note that references their specific engagement (the comment if present, otherwise the post). Output ONLY the message text.`,
  });
  return text.trim().slice(0, 280);
}

/**
 * Watchlist-signal drafter — congratulate-the-move opener. Job changes
 * are warm-intro gold for the first 30-60 days.
 */
export async function draftJobChangeConnectMessage(input: {
  personName: string;
  oldRole: string | null;
  oldCompany: string | null;
  newRole: string;
  newCompany: string;
  signalName: string;
  productPitch?: string;
}): Promise<string> {
  const { text } = await generateText({
    model: openai(MODEL_ID),
    system:
      "You write LinkedIn connection notes for newly-changed-job opportunities. Hard limit: 280 characters. Open with first name. Reference the new role specifically. Do NOT congratulate generically (\"congrats on the new role!\") — be specific about the move. End with a low-friction question or introduction.",
    prompt: `${input.personName} just moved${
      input.oldRole && input.oldCompany ? ` from ${input.oldRole} at ${input.oldCompany}` : ""
    } to ${input.newRole} at ${input.newCompany}.

Why we noticed them: matched our "${input.signalName}" job-change watchlist.${
      input.productPitch ? `\nWhat we do: ${input.productPitch}` : ""
    }

Write the note. Output ONLY the message text.`,
  });
  return text.trim().slice(0, 280);
}

export async function draftEmail(input: {
  recipientName?: string;
  recipientCompany?: string;
  recipientTitle?: string;
  context: string;
  productPitch?: string;
  fromName?: string;
}): Promise<{ subject: string; body: string }> {
  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: z.object({
      subject: z.string().describe("Subject line under 60 characters."),
      body: z.string().describe("Plain-text email body. Under 120 words."),
    }),
    system:
      "You write cold outreach emails for AI-built sales tools. Style: short, specific, concrete. No fake personalization. No 'I hope this email finds you well'. Open with one line that proves you read context. Body offers something useful — a question, a relevant resource, or a specific suggestion. End with a tiny ask (10-min call, link, reply). No P.S., no images, no signature beyond the sender's first name.",
    prompt: `Recipient: ${input.recipientName ?? "(name unknown)"}${
      input.recipientTitle ? `, ${input.recipientTitle}` : ""
    }${input.recipientCompany ? ` at ${input.recipientCompany}` : ""}

Context that triggered this outreach:
"""
${input.context}
"""

${input.productPitch ? `What we do: ${input.productPitch}\n` : ""}${
      input.fromName ? `Send as: ${input.fromName}\n` : ""
    }

Write subject + body.`,
  });
  return object;
}
