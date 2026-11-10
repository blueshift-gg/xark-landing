//! Minesweeper reveal proof: one proof for any reveal (a single cell, a flood
//! fill, or a mine click), all against the same committed board.
//!
//! A 9×9 board of mines is bit-packed into one field element and committed as
//! `hash2(packed, salt)` (Poseidon2). For each reveal the house publishes what
//! the player sees: every cell is `Hidden`, a neighbour count (`Clear`, `One` …
//! `Eight`) or a `Mine`. The circuit checks each shown cell against the
//! committed board, and a hidden cell carries no value, so nothing about it
//! leaks.
//!
//! Why one proof for a whole flood: instead of selecting one cell by a runtime
//! index (a one-hot decode and a mux), the circuit sweeps all 81 cells with a
//! compile-time index. Each cell's neighbour count is then a free linear
//! combination of fixed neighbours, and checking what is shown costs two rows
//! per cell, so a flood of K cells costs the commitment once plus a fixed sweep,
//! not K proofs that each re-hash the board.
use xark::prelude::*;
use xark_poseidon2::hash2;

/// The board's side.
pub const N: usize = 9;
/// Cells on the board.
pub const CELLS: usize = N * N;

/// What the player sees of one cell. The variants' order is their value in the
/// circuit: `Hidden` is 0, a count `k` is `1 + k`, and `Mine` is 10.
#[input]
pub enum Cell {
    Hidden,
    /// Opened, no neighbouring mines.
    Clear,
    One,
    Two,
    Three,
    Four,
    Five,
    Six,
    Seven,
    Eight,
    Mine,
}

/// A board as the player sees it: one public input per cell.
pub type View = [Choice<Cell>; CELLS];

/// The house's secret: where the mines are, and the salt that hides them.
#[input]
pub struct Board {
    /// `mines[r * 9 + c]`: whether cell `(r, c)` holds a mine.
    pub mines: [bool; CELLS],
    /// A random blinding value: without it the commitment could be brute-forced.
    pub salt: Field,
}

#[input]
impl Board {
    /// The commitment the house publishes before play: Poseidon2 of the packed
    /// board and the salt. 81 bits fit far below the field's modulus, so the
    /// packing is injective.
    pub fn commitment(&self) -> Field {
        let mut packed = Field::from(0u8);
        let mut bit = Field::from(1u8);
        for mine in self.mines {
            packed += bit * Field::from(mine);
            bit = bit + bit;
        }
        hash2(packed, self.salt)
    }

    /// What opening cell `at` (`r * 9 + c`) shows, every other cell hidden: the
    /// cell alone if it is a mine, else the flood fill from it (a cell with no
    /// neighbouring mines opens its neighbours too).
    #[cfg(not(xark))]
    pub fn reveal(&self, at: u8) -> View {
        let mut view = [Choice::of(Cell::Hidden); CELLS];
        let start = at as usize;
        assert!(start < CELLS, "cell {start} is off the board");
        if self.mines[start] {
            view[start] = Cell::Mine.into();
            return view;
        }
        // A cell is shown as soon as it is pushed, and pushed only while hidden, so
        // the stack never holds more than the board.
        let mut stack = [start; CELLS];
        let mut top = 1;
        view[start] = Cell::count(self.neighbours(start)).into();
        while top > 0 {
            top -= 1;
            let i = stack[top];
            if view[i] != Cell::Clear {
                continue;
            }
            for j in neighbours_of(i).into_iter().flatten() {
                if view[j] == Cell::Hidden && !self.mines[j] {
                    view[j] = Cell::count(self.neighbours(j)).into();
                    stack[top] = j;
                    top += 1;
                }
            }
        }
        view
    }
}

#[cfg(not(xark))]
impl Board {
    /// How many mines neighbour cell `i`.
    fn neighbours(&self, i: usize) -> usize {
        neighbours_of(i)
            .into_iter()
            .flatten()
            .filter(|&j| self.mines[j])
            .count()
    }
}

#[cfg(not(xark))]
impl Cell {
    /// The cell showing `k` neighbouring mines.
    fn count(k: usize) -> Cell {
        use Cell::*;
        [Clear, One, Two, Three, Four, Five, Six, Seven, Eight][k]
    }
}

/// The up to eight cells around cell `i`, clamped at the board's edges. In the
/// circuit every index is a compile-time constant, so a sum over them is a
/// linear combination, free of rows.
const fn neighbours_of(i: usize) -> [Option<usize>; 8] {
    let (r, c) = ((i / N) as isize, (i % N) as isize);
    let mut out = [None; 8];
    let mut k = 0;
    let mut dr = -1;
    while dr <= 1 {
        let mut dc = -1;
        while dc <= 1 {
            let (nr, nc) = (r + dr, c + dc);
            if (dr != 0 || dc != 0) && nr >= 0 && nr < N as isize && nc >= 0 && nc < N as isize {
                out[k] = Some(nr as usize * N + nc as usize);
                k += 1;
            }
            dc += 1;
        }
        dr += 1;
    }
    out
}

/// `view` shows the board committed to as `commitment`: every cell is either
/// hidden or exactly what the board holds there.
#[circuit]
pub fn minesweeper(board: Private<Board>, commitment: Public<Field>, view: Public<View>) {
    require_eq(board.commitment(), commitment);
    for (i, cell) in view.iter().enumerate() {
        let mut around = Field::from(0u8);
        for j in neighbours_of(i).into_iter().flatten() {
            around += Field::from(board.mines[j]);
        }
        // The cell's true face: `1 + around`, or 10 for a mine (`Cell`'s order).
        let mine = Field::from(board.mines[i]);
        let truth = Field::from(1u8) + around + mine * (Field::from(9u8) - around);
        // Shown as hidden (0) or as the truth, which is never 0: one row, and no
        // range check, since any other value fails it.
        let shown = cell.field();
        require_eq(shown * (shown - truth), Field::from(0u8));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mines at (0,0), (0,1), (8,8): a corner cluster, and an empty middle that
    /// floods most of the board.
    fn board() -> Board {
        let mut mines = [false; CELLS];
        for (r, c) in [(0, 0), (0, 1), (8, 8)] {
            mines[r * N + c] = true;
        }
        Board {
            mines,
            salt: Field::from(0x5a17_u64),
        }
    }

    fn at(r: usize, c: usize) -> usize {
        r * N + c
    }

    fn shown(view: &View) -> usize {
        view.iter().filter(|&&c| c != Cell::Hidden).count()
    }

    #[test]
    fn a_flood_fill_proves() {
        let b = board();
        let view = b.reveal(at(4, 4) as u8);
        // All but the three mines open: no safe cell is walled off on this board.
        assert_eq!(shown(&view), CELLS - 3);
        assert!(view[at(1, 1)] == Cell::Two);
        assert!(view[at(4, 4)] == Cell::Clear);
        assert!(view[at(0, 0)] == Cell::Hidden);
        minesweeper(b, b.commitment(), view).unwrap();
    }

    #[test]
    fn a_single_cell_and_a_mine_prove() {
        let b = board();
        let one = b.reveal(at(1, 0) as u8); // next to two mines: opens alone
        assert_eq!(shown(&one), 1);
        assert!(one[at(1, 0)] == Cell::Two);
        minesweeper(b, b.commitment(), one).unwrap();

        let boom = b.reveal(at(0, 0) as u8);
        assert_eq!(shown(&boom), 1);
        assert!(boom[at(0, 0)] == Cell::Mine);
        minesweeper(b, b.commitment(), boom).unwrap();

        // Nothing shown is a valid (if dull) reveal.
        minesweeper(b, b.commitment(), [Choice::of(Cell::Hidden); CELLS]).unwrap();
    }

    #[test]
    fn a_wrong_count_is_refused() {
        let b = board();
        let mut view = b.reveal(at(1, 0) as u8);
        view[at(1, 0)] = Cell::One.into();
        assert!(minesweeper(b, b.commitment(), view).is_err());
    }

    #[test]
    fn hiding_a_mine_is_refused() {
        // A mine can't be shown as a safe count, nor a safe cell as a mine.
        let b = board();
        let mut view = b.reveal(at(0, 0) as u8);
        view[at(0, 0)] = Cell::Two.into();
        assert!(minesweeper(b, b.commitment(), view).is_err());
        let mut view = b.reveal(at(1, 0) as u8);
        view[at(1, 0)] = Cell::Mine.into();
        assert!(minesweeper(b, b.commitment(), view).is_err());
    }

    #[test]
    fn another_board_is_refused() {
        // A house that moves a mine after committing can't prove its reveal.
        let b = board();
        let mut moved = b;
        moved.mines[at(8, 8)] = false;
        moved.mines[at(4, 4)] = true;
        assert!(minesweeper(moved, b.commitment(), moved.reveal(at(4, 4) as u8)).is_err());
        let mut salted = b;
        salted.salt = Field::from(1u8);
        assert!(minesweeper(salted, b.commitment(), b.reveal(at(4, 4) as u8)).is_err());
    }
}
