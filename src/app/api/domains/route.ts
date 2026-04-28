/**
 * GET  /api/domains — list custom domains for the tenant.
 * POST /api/domains — add a new custom domain.
 *   body: { domain: string }
 *   Response includes the DNS records the customer needs to add to
 *   their registrar before verification.
 */

import { NextResponse } from "next/server";
import { listDomains, createDomain } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const domains = await listDomains();
    return NextResponse.json({ domains });
  } catch (err: any) {
    return NextResponse.json({ domains: [], error: err.message }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const domain = String(body?.domain ?? "").trim().toLowerCase();
  // Permissive validation — the API rejects invalid domains with a real error.
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/.test(domain)) {
    return NextResponse.json(
      { error: "Domain must look like example.com (no scheme, no path)." },
      { status: 400 },
    );
  }
  try {
    const result = await createDomain(domain);
    return NextResponse.json({ domain: result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "create failed" }, { status: 502 });
  }
}
