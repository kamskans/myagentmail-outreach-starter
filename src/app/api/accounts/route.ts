import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  linkedInLogin,
  linkedInVerifyChallenge,
  linkedInPollMobileApproval,
  linkedInImportCookies,
  listLinkedInSessions,
} from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const local = db
    .prepare<[], any>(
      `SELECT id, label, session_id AS sessionId, status, created_at AS createdAt, last_used_at AS lastUsedAt
       FROM linkedin_accounts ORDER BY created_at DESC`,
    )
    .all();
  let remote: any[] = [];
  try {
    remote = await listLinkedInSessions();
  } catch {}
  const remoteById = new Map(remote.map((r: any) => [r.id, r]));
  const merged = local.map((row: any) => ({
    ...row,
    remoteStatus: remoteById.get(row.sessionId)?.status ?? "unknown",
  }));
  return NextResponse.json({ accounts: merged, remote });
}

const Login = z.object({
  mode: z.literal("login"),
  email: z.string().email(),
  password: z.string().min(1),
  label: z.string().optional(),
});
const Verify = z.object({
  mode: z.literal("verify"),
  challengeId: z.string(),
  pin: z.string().min(1),
  label: z.string().optional(),
});
// LinkedIn challenges are dual-path: the user can satisfy them by typing
// the PIN they were emailed OR by tapping "Yes, it's me" in the LinkedIn
// mobile app. We expose both via the same backend, the UI runs them
// concurrently, whichever completes first wins.
const Poll = z.object({
  mode: z.literal("poll"),
  challengeId: z.string(),
  label: z.string().optional(),
});
const Import = z.object({
  mode: z.literal("import"),
  liAt: z.string().min(1),
  jsessionId: z.string().min(1),
  label: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = z.discriminatedUnion("mode", [Login, Verify, Poll, Import]).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", detail: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const db = getDb();

  let result: any;
  if (data.mode === "login") result = await linkedInLogin(data);
  else if (data.mode === "verify") result = await linkedInVerifyChallenge(data);
  else if (data.mode === "poll") result = await linkedInPollMobileApproval(data);
  else result = await linkedInImportCookies(data);

  if ("ok" in result && result.ok && "sessionId" in result) {
    const id = `acct_${Date.now().toString(36)}`;
    db.prepare(
      `INSERT INTO linkedin_accounts (id, label, session_id, status) VALUES (?, ?, ?, 'active')`,
    ).run(id, data.label ?? "LinkedIn account", result.sessionId);
    return NextResponse.json({ ok: true, accountId: id, ...result });
  }
  return NextResponse.json(result);
}
