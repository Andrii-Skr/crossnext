import type { Cell, Grid, Slot } from "@/utils/cross/types";
import { DIRS } from "@/utils/cross/types";

const ALLOWED = new Set<Cell>(["*", "#", "↓", "→", "↘"]);

export function validate(grid: Grid): void {
  const { rows: ROWS, cols: COLS, data } = grid;
  if (data.length !== ROWS) {
    throw new Error(`bad row count: ${data.length} (expect ${ROWS})`);
  }
  data.forEach((row, i) => {
    if (row.length !== COLS) {
      throw new Error(`row ${i} length ${row.length} (expect ${COLS})`);
    }
    for (const ch of row) {
      if (!ALLOWED.has(ch as Cell)) {
        throw new Error(`invalid char '${ch}' in row ${i}`);
      }
    }
  });
}

const dirListFrom = (ch: Cell) =>
  ch === "↓" ? [DIRS.down] : ch === "→" ? [DIRS.right] : ch === "↘" ? [DIRS.down, DIRS.right] : [];

const isStart = (
  at: (r: number, c: number) => Cell,
  r: number,
  c: number,
  dir: (typeof DIRS)[keyof typeof DIRS],
) => {
  if (dir === DIRS.right) return c === 0 || at(r, c - 1) === "#";
  return r === 0 || at(r - 1, c) === "#";
};

export function scanSlots(grid: Grid): Slot[] {
  const { rows: ROWS, cols: COLS, data } = grid;
  const at = (r: number, c: number) => data[r][c] as Cell;
  const slots: Slot[] = [];
  let id = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const dir of dirListFrom(at(r, c))) {
        if (!isStart(at, r, c, dir)) continue;
        const cells: [number, number][] = [[r, c]];
        for (
          let nr = r + dir.dr, nc = c + dir.dc;
          nr < ROWS && nc < COLS && at(nr, nc) !== "#";
          nr += dir.dr, nc += dir.dc
        ) {
          cells.push([nr, nc]);
        }
        if (cells.length > 1) slots.push({ id: id++, r, c, dir, len: cells.length, cells });
      }
    }
  }
  return slots;
}

export function lengthStats(slots: Slot[]): Record<string, number> {
  const stats: Record<string, number> = { total: slots.length };
  for (const { len } of slots) stats[len] = (stats[len] ?? 0) + 1;
  return stats;
}

