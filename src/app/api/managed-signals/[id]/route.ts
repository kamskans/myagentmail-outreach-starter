import { NextResponse } from "next/server";
import { deleteManagedSignal, runManagedSignal } from "@/lib/myagentmail";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteManagedSignal(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const r = await runManagedSignal(params.id);
    return NextResponse.json(r);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
