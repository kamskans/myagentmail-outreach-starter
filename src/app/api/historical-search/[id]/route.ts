import { NextResponse } from "next/server";
import { getHistoricalSearch } from "@/lib/myagentmail";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await getHistoricalSearch(params.id);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
