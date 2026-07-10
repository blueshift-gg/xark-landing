import { floodCells, N, proveRevealSet } from "@/lib/minesweeper";
import { unsealGame } from "@/lib/game-token";

export const dynamic = "force-dynamic";

// One proof for the whole flood. The client sends the encrypted game token
// (received from /new) as `id` — the server decrypts it to recover the board,
// salt, and commitment. No server-side state at all.
export async function POST(req: Request) {
  let body: { id?: unknown; r?: unknown; c?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const game = await unsealGame(String(body.id));
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
    const reveal = await proveRevealSet(
      game.board,
      game.salt,
      floodCells(game.board, r, c),
      game.commitment,
    );
    return Response.json(reveal);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
