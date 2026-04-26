/**
 * Thin proxy over MyAgentMail's managed signal endpoints. The starter
 * keeps a local UI but stores no signal config locally — the source of
 * truth is /v1/linkedin/signals on MyAgentMail.
 */

import { NextResponse } from "next/server";
import {
  listManagedSignals,
  createManagedSignal,
  deleteManagedSignal,
  runManagedSignal,
  listLinkedInSessions,
} from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [signals, sessions] = await Promise.all([
      listManagedSignals(),
      listLinkedInSessions().catch(() => []),
    ]);
    return NextResponse.json({ signals, sessions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  try {
    const signal = await createManagedSignal(body);
    return NextResponse.json({ signal });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
