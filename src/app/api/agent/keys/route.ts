/**
 * GET  /api/agent/keys — reports which keys are configured (without
 *                        leaking the values).
 * POST /api/agent/keys — writes/updates MYAGENTMAIL_API_KEY and
 *                        OPENAI_API_KEY to .env on disk. Used as
 *                        onboarding step 0 so users never have to
 *                        leave the browser to configure the starter.
 *
 * Once written, requires a dev-server restart. We attempt a soft
 * reload by mutating process.env in-memory (works for the SDK helpers
 * that read env on every call) but the running Next.js process won't
 * pick the new values up universally — the response includes a
 * `restartRequired` flag the UI uses to prompt the user.
 */

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const ENV_PATH = path.resolve(process.cwd(), ".env");

type KeyStatus = {
  myagentmail: { set: boolean; placeholder: boolean };
  openai: { set: boolean; placeholder: boolean };
  rocketreach: { set: boolean; placeholder: boolean };
  webhookSecret: { set: boolean };
};

function statusFor(value: string | undefined, placeholder: RegExp): { set: boolean; placeholder: boolean } {
  const v = (value || "").trim();
  if (!v) return { set: false, placeholder: false };
  if (placeholder.test(v)) return { set: false, placeholder: true };
  return { set: true, placeholder: false };
}

function currentStatus(): KeyStatus {
  return {
    myagentmail: statusFor(process.env.MYAGENTMAIL_API_KEY, /^tk_your_key_here$/),
    openai: statusFor(process.env.OPENAI_API_KEY, /^sk-your_key_here$|^$/),
    rocketreach: statusFor(process.env.ROCKETREACH_API_KEY, /^your_rocketreach_key_here$/),
    webhookSecret: { set: !!(process.env.MYAGENTMAIL_WEBHOOK_SECRET || "").trim() },
  };
}

export async function GET() {
  return NextResponse.json({ status: currentStatus() });
}

/**
 * Read .env, parse, mutate target keys, write back. Preserves comments
 * and other lines. If a key is absent it gets appended.
 */
async function patchEnv(updates: Record<string, string>) {
  let content = "";
  try {
    content = await fs.readFile(ENV_PATH, "utf8");
  } catch {
    /* file may not exist; we'll create it */
  }
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const patched = lines.map((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (!m) return line;
    const key = m[1];
    if (key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) patched.push(`${key}=${value}`);
  }
  await fs.writeFile(ENV_PATH, patched.join("\n"), "utf8");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const updates: Record<string, string> = {};
  if (typeof body.myagentmailApiKey === "string" && body.myagentmailApiKey.trim()) {
    const v = body.myagentmailApiKey.trim();
    if (!/^tk_[A-Za-z0-9_-]{10,}$/.test(v)) {
      return NextResponse.json(
        { error: "MyAgentMail key must look like tk_..." },
        { status: 400 },
      );
    }
    updates.MYAGENTMAIL_API_KEY = v;
    process.env.MYAGENTMAIL_API_KEY = v;
  }
  if (typeof body.openaiApiKey === "string" && body.openaiApiKey.trim()) {
    const v = body.openaiApiKey.trim();
    if (!/^sk-[A-Za-z0-9_-]{10,}$/.test(v)) {
      return NextResponse.json(
        { error: "OpenAI key must look like sk-..." },
        { status: 400 },
      );
    }
    updates.OPENAI_API_KEY = v;
    process.env.OPENAI_API_KEY = v;
  }
  if (typeof body.rocketreachApiKey === "string" && body.rocketreachApiKey.trim()) {
    // RocketReach keys are an alphanumeric string — no fixed prefix.
    // We just check non-empty + reasonable length.
    const v = body.rocketreachApiKey.trim();
    if (v.length < 16) {
      return NextResponse.json(
        { error: "RocketReach key looks too short — paste the full key from rocketreach.co/api." },
        { status: 400 },
      );
    }
    updates.ROCKETREACH_API_KEY = v;
    process.env.ROCKETREACH_API_KEY = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Provide at least one key to save." }, { status: 400 });
  }
  try {
    await patchEnv(updates);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not write .env: ${err?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    status: currentStatus(),
    // process.env mutation works for new SDK calls in this process,
    // but Next.js's RSC bundle may have captured old values. Surface
    // the recommendation regardless.
    restartRequired: true,
  });
}
