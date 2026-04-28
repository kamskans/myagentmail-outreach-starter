/**
 * POST /api/agent/infer
 *
 * Body: { websiteUrl: string }
 * Pulls the user's website, runs an LLM pass to infer ICP + suggested
 * intent signals (keywords, competitor companies, influencer profiles).
 * Returns the structured suggestion. The onboarding wizard pre-fills
 * its review screen with this — user edits, then clicks Launch.
 */

import { NextResponse } from "next/server";
import { inferIcpFromWebsite } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const websiteUrl = String(body?.websiteUrl ?? "").trim();
  if (!websiteUrl || !/^https?:\/\//i.test(websiteUrl)) {
    return NextResponse.json(
      { error: "websiteUrl must be a full URL (https://...)" },
      { status: 400 },
    );
  }
  // Surface a real diagnostic if the OpenAI key isn't set — the AI SDK
  // will otherwise blow up with an opaque 401 deep inside generateObject.
  const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!openaiKey || /^sk-your_key_here$/.test(openaiKey)) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not set. Go back to step 1 of onboarding to configure it, then restart npm run dev.",
      },
      { status: 400 },
    );
  }
  try {
    const icp = await inferIcpFromWebsite(websiteUrl);
    return NextResponse.json({ icp });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "inference failed" },
      { status: 500 },
    );
  }
}
