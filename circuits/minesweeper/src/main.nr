// Minesweeper cell-opening proof — the honest ZK demo behind the xark landing.
//
// A 9x9 board (0 = safe, 1 = mine) is packed into a single field element and
// committed as Poseidon2(packed, salt). Given a public cell (r, c), the circuit
// RETURNS (commitment, is_mine, count) — the mine flag and neighbour-mine count
// for that one cell, and the commitment — while revealing nothing about any
// other cell. The server keeps `board` and `salt` secret and never re-hashes
// anything itself; the browser verifies the proof and reads the outputs. Every
// reveal proves against the same commitment, so the house cannot move a mine or
// lie about a cell, and unopened cells stay hidden.

global BOARD: u32 = 81;
global N: u32 = 9;

fn hash2(a: Field, b: Field) -> Field {
    std::hash::poseidon2_permutation([a, b, 0, 0])[0]
}

fn main(board: [Field; 81], salt: Field, r: pub u32, c: pub u32) -> pub [Field; 3] {
    assert(r < N);
    assert(c < N);

    // Pack + boolean-constrain the whole board, then commit to it.
    let mut packed: Field = 0;
    let mut pow: Field = 1;
    for i in 0..BOARD {
        assert(board[i] * (board[i] - 1) == 0);
        packed += board[i] * pow;
        pow *= 2;
    }
    let commitment = hash2(packed, salt);

    // Open cell (r, c): its own value + its neighbour-mine count. Static scan of
    // the board (constant indices) — the adjacency test uses only comparisons to
    // the public (r, c), so there is no dynamic indexing.
    let mut is_mine: Field = 0;
    let mut count: Field = 0;
    for j in 0..BOARD {
        let rj: u32 = j / 9;
        let cj: u32 = j % 9;
        let dr: u32 = if r >= rj { r - rj } else { rj - r };
        let dc: u32 = if c >= cj { c - cj } else { cj - c };
        let adjacent = (dr <= 1) & (dc <= 1);
        let is_self = (dr == 0) & (dc == 0);
        is_mine += (is_self as Field) * board[j];
        count += ((adjacent & !is_self) as Field) * board[j];
    }

    [commitment, is_mine, count]
}

#[test]
fn opens_with_correct_count() {
    let mut board: [Field; 81] = [0; 81];
    board[0] = 1; //  (0,0)
    board[1] = 1; //  (0,1)
    board[9] = 1; //  (1,0)
    // cell (1,1) is safe and touches all three mines
    let out = main(board, 12345, 1, 1);
    assert(out[1] == 0);
    assert(out[2] == 3);
}

#[test]
fn reports_a_mine() {
    let mut board: [Field; 81] = [0; 81];
    board[40] = 1; // (4,4)
    let out = main(board, 7, 4, 4);
    assert(out[1] == 1);
}

#[test]
fn edge_cell_counts_only_valid_neighbours() {
    let mut board: [Field; 81] = [0; 81];
    board[1] = 1; // (0,1)
    board[9] = 1; // (1,0)
    board[10] = 1; // (1,1)
    // corner (0,0) has exactly three in-bounds neighbours, all mines
    let out = main(board, 99, 0, 0);
    assert(out[1] == 0);
    assert(out[2] == 3);
}
