// The house: a Web Worker that holds the board and proves every reveal, so the
// mines and the salt never reach the page, and proving never blocks it. The page
// only ever sees the commitment, what each reveal shows, and the proof of it,
// which it verifies itself (`components/MinesweeperDemo.tsx`).
//
// One thread is plenty: a reveal is a 484-row circuit, about 60 ms to prove. A
// worker pool (`@blueshift-gg/xark/pool`) would need the page cross-origin
// isolated, which the site isn't.

import {
  Board,
  Field,
  Minesweeper,
  type MinesweeperProver,
} from "@/circuits/minesweeper/artifacts/minesweeper";
import {
  CENTER,
  genMines,
  randSalt,
  type FromHouse,
  type ToHouse,
} from "@/lib/minesweeper-shared";

let prover: Promise<MinesweeperProver> | null = null;

/** The prover, made once: pinned to the circuit the client was generated from. */
function load(): Promise<MinesweeperProver> {
  prover ??= (async () => {
    const [{ xbcBytes, sources }, { pkBytes }, { clientWasmBytes }] =
      await Promise.all([
        import("@/circuits/minesweeper/artifacts/xbc"),
        import("@/circuits/minesweeper/artifacts/pk"),
        import("@/circuits/minesweeper/artifacts/client-wasm"),
      ]);
    const p = await Minesweeper.prover(
      {
        circuit: xbcBytes,
        provingKey: pkBytes,
        sources,
        client: clientWasmBytes,
      },
      { digest: Minesweeper.digest },
    );
    p.preload();
    return p;
  })();
  prover.catch(() => (prover = null)); // a failed load is retried next time
  return prover;
}

let board: Board | null = null;
let commitment: Field | null = null;

/** Open cell `at` (the flood fill is the circuit crate's `Board::reveal`) and prove it. */
function reveal(p: MinesweeperProver, at: number) {
  if (!board || !commitment) throw new Error("no board yet");
  const view = Board.reveal(board, at);
  const t = performance.now();
  const proof = p.prove({ board, commitment, view }).toBytesCompressed();
  return { view, proof, ms: performance.now() - t };
}

function post(msg: FromHouse) {
  const transfer = "proof" in msg ? [msg.proof.buffer as ArrayBuffer] : [];
  self.postMessage(msg, { transfer });
}

self.onmessage = async (e: MessageEvent<ToHouse>) => {
  try {
    const { id } = e.data;
    const p = await load();
    if (e.data.type === "new") {
      board = { mines: genMines(), salt: new Field(randSalt()) };
      commitment = Board.commitment(board);
      post({
        id,
        type: "board",
        commitment: commitment.toString(),
        ...reveal(p, CENTER),
      });
    } else {
      post({ id, type: "reveal", cell: e.data.cell, ...reveal(p, e.data.cell) });
    }
  } catch (err) {
    post({ id: e.data.id, type: "error", message: String(err) });
  }
};
