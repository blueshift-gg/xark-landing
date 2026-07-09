import { floodCells, getGame, N, proveCell } from "@/lib/minesweeper";
import type { Reveal } from "@/lib/minesweeper";

export const dynamic = "force-dynamic";

// Streams one proof per opened cell as NDJSON, so a flood cascades open in the
// browser (and the proof counter ticks live) instead of blocking on the whole
// region. Each prove is wrapped in setImmediate so the synchronous WASM call
// doesn't starve the event loop between chunks.
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
  if (!Number.isInteger(r) || r < 0 || r >= N || !Number.isInteger(c) || c < 0 || c >= N) {
    return Response.json({ error: "cell out of range" }, { status: 400 });
  }

  const cells = floodCells(game.board, r, c);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const [pr, pc] of cells) {
        try {
          const rv = await new Promise<Reveal>((resolve, reject) => {
            setImmediate(() => {
              proveCell(game.board, game.salt, pr, pc).then(resolve, reject);
            });
          });
          controller.enqueue(encoder.encode(JSON.stringify(rv) + "\n"));
        } catch {
          // skip a cell that failed to prove; keep the cascade going
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
