//! Minesweeper cell-opening proof — the honest ZK demo behind the xark landing.
//!
//! A 9×9 board (`board[i] ∈ {0,1}`, 0 = safe, 1 = mine) is packed into a single
//! field element and committed as `hash2(packed, salt)` (Poseidon2). Given a
//! public cell `(r, c)` the circuit constrains `(commitment, is_mine, count)`
//! against the committed board — proving that one cell's value while revealing
//! nothing about any other cell.
//!
//! The prover (server) supplies **every** public value — including `commitment`,
//! `is_mine` and `count` — and the circuit asserts each is correct. The verifier
//! (browser) reads those values back out of the proof's public signals, so the
//! house cannot move a mine or lie about a cell, and unopened cells stay hidden.
//! Every reveal proves against the same commitment, so a moved mine (different
//! board) would change the commitment and fail the browser's consistency check.

#![no_std]
use xark::prelude::*;
use xark_poseidon2::hash2;

pub fn circuit(
    board: Private<[Field; 81]>,
    salt: Private<Field>,
    r: Public<Field>,
    c: Public<Field>,
    commitment: Public<Field>,
    is_mine: Public<Field>,
    count: Public<Field>,
) {
    // r, c must be valid 9×9 coordinates. `U::<4>` range-proves `< 16`; the
    // explicit `< 9` check tightens that to the board. This range proof is also
    // what makes the ±1 neighbour sentinels below sound: a coordinate outside
    // `[0,8]` can never equal a sentinel constant.
    let ru = U::<4>::new(r);
    let cu = U::<4>::new(c);
    assert(ru.lt_const::<9>());
    assert(cu.lt_const::<9>());

    // Pack + boolean-constrain the whole board, then commit to it.
    let mut packed = Field::from(0u8);
    let mut pow = Field::from(1u8);
    let mut i = 0usize;
    while i < 81 {
        assert_eq(board[i] * (board[i] - 1u8), Field::from(0u8)); // board[i] ∈ {0, 1}
        packed = packed + board[i] * pow;
        pow = pow + pow;
        i += 1;
    }
    assert_eq(hash2(packed, salt), commitment);

    // Open cell (r, c): its own value + its neighbour-mine count. Static scan of
    // the board (constant indices). Two cells are adjacent iff their rows differ
    // by ≤ 1 AND their columns differ by ≤ 1; since rj = j/9 and cj = j%9 are
    // compile-time constants per unrolled iteration, adjacency is a disjunction
    // of equalities with the public (r, c) — no dynamic indexing and no
    // witness-dependent control flow. `rj - 1` / `rj + 1` are field constants;
    // at the board edge they evaluate to a value outside `[0,8]` (e.g. `-1` or
    // `9`), which the range-proved `r`/`c` can never equal, so they correctly
    // contribute nothing.
    let mut is_mine_acc = Field::from(0u8);
    let mut count_acc = Field::from(0u8);
    let mut j = 0usize;
    while j < 81 {
        let rj = (j / 9) as u64;
        let cj = (j % 9) as u64;
        let rj_f = Field::from(rj);
        let cj_f = Field::from(cj);

        let row_adj = (r == rj_f) | (r == (rj_f - 1u8)) | (r == (rj_f + 1u8));
        let col_adj = (c == cj_f) | (c == (cj_f - 1u8)) | (c == (cj_f + 1u8));
        let adjacent = row_adj & col_adj;
        let is_self = (r == rj_f) & (c == cj_f);

        is_mine_acc = is_mine_acc + Field::from(is_self) * board[j];
        count_acc = count_acc + Field::from(adjacent & !is_self) * board[j];
        j += 1;
    }

    assert_eq(is_mine_acc, is_mine);
    assert_eq(count_acc, count);
}
