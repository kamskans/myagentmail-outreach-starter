/**
 * GET  /api/inboxes — list provisioned inboxes (proxy to /v1/inboxes)
 * POST /api/inboxes — provision a new inbox
 *   body: { username: string, displayName?: string, domain?: string }
 *   - omit `domain` to use the default @myagentmail.com address
 *   - pass a verified custom-domain string to provision an inbox under it
 */

import { NextResponse } from "next/server";
import { listInboxes, createInbox } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const inboxes = await listInboxes();
    return NextResponse.json({ inboxes });
  } catch (err: any) {
    return NextResponse.json({ inboxes: [], error: err.message }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const username = String(body?.username ?? "").trim();
  if (!username || !/^[a-z0-9._-]{1,64}$/i.test(username)) {
    return NextResponse.json(
      { error: "username must be lowercase letters/digits/._- (max 64 chars)" },
      { status: 400 },
    );
  }
  try {
    const inbox = await createInbox({
      username,
      displayName: body?.displayName?.trim() || undefined,
      domain: body?.domain?.trim() || undefined,
    });
    return NextResponse.json({ inbox });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "create failed" }, { status: 502 });
  }
}
