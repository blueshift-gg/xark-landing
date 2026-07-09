import { NextResponse } from "next/server";

import { newGame } from "@/lib/minesweeper";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await newGame());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
