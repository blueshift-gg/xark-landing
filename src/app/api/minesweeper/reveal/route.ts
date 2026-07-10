import { floodCells, getGame, N, proveRevealSet } from "@/lib/minesweeper";

export const dynamic = "force-dynamic";

// One proof for the whole flood. The client verifies the single proof, then
// animates the cells open locally — so an exploding reveal is one round-trip,
// not one proof per cell.
export async function POST(req: Request) {
  let body: { id?: unknown; r?: unknown; c?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const game = getGame(String(body.id));
  if (!game) {
    return Response.json({ error: "unknown or expired game" }, { status: 404 });
  }
  const r = Number(body.r);
  const c = Number(body.c);
  if (
    !Number.isInteger(r) ||
    r < 0 ||
    r >= N ||
    !Number.isInteger(c) ||
    c < 0 ||
    c >= N
  ) {
    return Response.json({ error: "cell out of range" }, { status: 400 });
  }

  try {
    // floodCells returns [[r,c]] if the clicked cell is a mine (game over);
    // otherwise the full flood region. Either way: a single proof.
    const reveal = await proveRevealSet(game.board, game.salt, floodCells(game.board, r, c), game.commitment);
    return Response.json(reveal);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
