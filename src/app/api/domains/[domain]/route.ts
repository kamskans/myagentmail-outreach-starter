/**
 * GET    /api/domains/[domain]        — get a single domain (incl. DNS records)
 * DELETE /api/domains/[domain]        — remove the domain (SES + Stalwart cleanup)
 */

import { NextResponse } from "next/server";
import { getDomain, deleteDomain } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { domain: string } }) {
  try {
    const domain = await getDomain(params.domain);
    return NextResponse.json({ domain });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "fetch failed" }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { domain: string } }) {
  try {
    await deleteDomain(params.domain);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "delete failed" }, { status: 502 });
  }
}
