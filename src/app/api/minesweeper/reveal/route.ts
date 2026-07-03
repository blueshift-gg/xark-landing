import { NextResponse } from "next/server";

import { revealCell } from "@/lib/minesweeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { id, r, c } = await req.json();
    return NextResponse.json(await revealCell(String(id), Number(r), Number(c)));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
