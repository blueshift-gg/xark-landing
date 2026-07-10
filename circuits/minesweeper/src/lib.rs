//! Minesweeper reveal proof — ONE proof for any reveal: a single cell, a flood
//! fill, or a mine click, all against the committed board.
//!
//! A 9×9 board (`board[i] ∈ {0,1}`, 0 = safe, 1 = mine) is bit-packed into one
//! field element and committed as `hash2(packed, salt)` (Poseidon2). The prover
//! supplies a public reveal bitmask `revealed[i]` (1 = open cell `i`) and, for
//! each opened cell, its mine flag `is_mine[i]` and neighbour count `count[i]`.
//! The circuit asserts each is correct; hidden cells are forced to
//! `is_mine = count = 0`, so nothing about them leaks.
//!
//! Why one proof for a whole flood: instead of selecting one cell by a runtime
//! `(r, c)` (expensive one-hot decode + mux), we sweep all 81 cells with a
//! compile-time index `i`. Each cell's neighbour count `ns[i]` is then a *free
//! linear combination* of fixed neighbours — no one-hot, no mux — and gating the
//! outputs by `revealed[i]` is ~2 constraints/cell. So a flood of K cells costs
//! the same one-time commitment plus ~2K constraints, in a single proof — vs K
//! separate proofs that each re-hash the whole board.

#![no_std]
use xark::prelude::*;
use xark_poseidon2::hash2;

const N: u8 = 9;
const SIZE: usize = (N * N) as usize;

pub fn circuit(
    board: Private<[Field; SIZE]>,
    salt: Private<Field>,
    commitment: Public<Field>,
    // Public reveal bitmask: revealed[i] == 1 ⟹ cell i is opened this proof.
    revealed: Public<[Field; SIZE]>,
    // Public per-cell mine flag. Asserted == revealed[i] * board[i], so a hidden
    // cell is forced to 0 and an opened mine reads 1 (game over).
    is_mine: Public<[Field; SIZE]>,
    // Public per-cell neighbour count. Asserted == revealed[i] * ns[i], so a
    // hidden cell is forced to 0 (no leak of nearby mine counts).
    count: Public<[Field; SIZE]>,
) {
    // Commit the board once: booleanity + Poseidon2. Paid once per proof,
    // amortised across every cell opened in it.
    let mut packed = Field::from(0u8);
    let mut pow = Field::from(1u8);
    for cell in board {
        cell.assert_bool();
        packed = packed + cell * pow;
        pow = pow + pow;
    }
    assert_eq(hash2(packed, salt), commitment);

    // Sweep all cells with a compile-time index. ns[i] = neighbour mine count
    // (free linear sum of the fixed neighbours; centre excluded, boundary
    // clamped). The only per-cell constraints are the two gated equalities and
    // the bitmask booleanity.
    let mut i = 0usize;
    while i < SIZE {
        let ri = i / (N as usize);
        let ci = i % (N as usize);

        let mut ns = Field::from(0u8);
        let mut dr = 0u8;
        while dr < 3 {
            let mut dc = 0u8;
            while dc < 3 {
                if !(dr == 1 && dc == 1) {
                    let nr = (ri as i32) + (dr as i32) - 1;
                    let nc = (ci as i32) + (dc as i32) - 1;
                    if nr >= 0 && nr < (N as i32) && nc >= 0 && nc < (N as i32) {
                        let nidx = (nr as usize) * (N as usize) + (nc as usize);
                        ns = ns + board[nidx];
                    }
                }
                dc += 1;
            }
            dr += 1;
        }

        revealed[i].assert_bool();
        assert_eq(is_mine[i], revealed[i] * board[i]); // mine flag (0 if hidden)
        assert_eq(count[i], revealed[i] * ns);         // neighbour count (0 if hidden)
        i += 1;
    }
}
