/**
 * GET /api/domains/[domain]/verify — re-checks DNS / SES verification status.
 * The UI calls this on demand from a "Check verification" button.
 */

import { NextResponse } from "next/server";
import { verifyDomain } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { domain: string } }) {
  try {
    const domain = await verifyDomain(params.domain);
    return NextResponse.json({ domain });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "verify failed" }, { status: 502 });
  }
}
