import type { Cell, Grid, Slot } from "@/utils/cross/types";
import { DIRS } from "@/utils/cross/types";

const ALLOWED = new Set<Cell>(["*", "#", "↓", "→", "↘"]);
const DEFAULT_MIN_WORD_LEN = 2;

type Dir = (typeof DIRS)[keyof typeof DIRS];

export type SlotDirName = "down" | "right";
export type SlotScanMode = "arrow" | "classic";
export type SlotScanModeOption = SlotScanMode | "auto";

export type SlotStart = {
  number: number;
  r: number;
  c: number;
  dir: SlotDirName;
  slotId: number;
};

export type ScanSlotsDetailedOptions = {
  mode?: SlotScanModeOption;
  minLen?: number;
  preferRightOnDualStart?: boolean;
};

export type ScanSlotsDetailedResult = {
  mode: SlotScanMode;
  slots: Slot[];
  starts: SlotStart[];
  startNumberBySlotId: Map<number, number>;
  numberGrid: number[][];
};

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

const isArrowStart = (at: (r: number, c: number) => Cell, r: number, c: number, dir: Dir) => {
  if (dir === DIRS.right) return c === 0 || at(r, c - 1) === "#";
  return r === 0 || at(r - 1, c) === "#";
};

const dirName = (dir: Dir): SlotDirName => (dir === DIRS.right ? "right" : "down");

function detectMode(grid: Grid): SlotScanMode {
  for (const row of grid.data) {
    for (const ch of row) {
      if (ch === "↓" || ch === "→" || ch === "↘") return "arrow";
    }
  }
  return "classic";
}

function traceCells(
  at: (r: number, c: number) => Cell,
  rows: number,
  cols: number,
  r: number,
  c: number,
  dir: Dir,
): [number, number][] {
  const cells: [number, number][] = [[r, c]];
  for (let nr = r + dir.dr, nc = c + dir.dc; nr < rows && nc < cols && at(nr, nc) !== "#"; nr += dir.dr, nc += dir.dc) {
    cells.push([nr, nc]);
  }
  return cells;
}

function scanArrowSlots(grid: Grid, minLen: number): Slot[] {
  const { rows: ROWS, cols: COLS, data } = grid;
  const at = (r: number, c: number) => data[r][c] as Cell;
  const slots: Slot[] = [];
  let id = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const dir of dirListFrom(at(r, c))) {
        if (!isArrowStart(at, r, c, dir)) continue;
        const cells = traceCells(at, ROWS, COLS, r, c, dir);
        if (cells.length >= minLen) slots.push({ id: id++, r, c, dir, len: cells.length, cells });
      }
    }
  }
  return slots;
}

function scanClassicSlots(grid: Grid, minLen: number, preferRightOnDualStart: boolean): Slot[] {
  const { rows: ROWS, cols: COLS, data } = grid;
  const at = (r: number, c: number) => data[r][c] as Cell;
  const slots: Slot[] = [];
  let id = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (at(r, c) === "#") continue;

      const canStartRight = (c === 0 || at(r, c - 1) === "#") && c + 1 < COLS && at(r, c + 1) !== "#";
      const canStartDown = (r === 0 || at(r - 1, c) === "#") && r + 1 < ROWS && at(r + 1, c) !== "#";

      const dirs: Dir[] = [];
      if (canStartRight) dirs.push(DIRS.right);
      if (canStartDown && !(preferRightOnDualStart && canStartRight)) dirs.push(DIRS.down);

      for (const dir of dirs) {
        const cells = traceCells(at, ROWS, COLS, r, c, dir);
        if (cells.length >= minLen) slots.push({ id: id++, r, c, dir, len: cells.length, cells });
      }
    }
  }
  return slots;
}

function buildStartNumbering(grid: Grid, slots: Slot[]): Omit<ScanSlotsDetailedResult, "mode" | "slots"> {
  const numberGrid: number[][] = Array.from({ length: grid.rows }, () => Array(grid.cols).fill(0));
  const startNumberBySlotId = new Map<number, number>();
  const starts: SlotStart[] = [];

  const uniqueStarts = new Map<string, { r: number; c: number }>();
  for (const slot of slots) {
    const key = `${slot.r},${slot.c}`;
    if (!uniqueStarts.has(key)) uniqueStarts.set(key, { r: slot.r, c: slot.c });
  }

  const sorted = [...uniqueStarts.values()].sort((a, b) => a.r - b.r || a.c - b.c);
  const numberByCell = new Map<string, number>();
  sorted.forEach((item, idx) => {
    const number = idx + 1;
    numberByCell.set(`${item.r},${item.c}`, number);
    numberGrid[item.r][item.c] = number;
  });

  for (const slot of slots) {
    const number = numberByCell.get(`${slot.r},${slot.c}`);
    if (!number) continue;
    startNumberBySlotId.set(slot.id, number);
    starts.push({
      number,
      r: slot.r,
      c: slot.c,
      dir: dirName(slot.dir),
      slotId: slot.id,
    });
  }

  return {
    starts,
    startNumberBySlotId,
    numberGrid,
  };
}

export function scanSlotsDetailed(grid: Grid, options: ScanSlotsDetailedOptions = {}): ScanSlotsDetailedResult {
  const modeOption = options.mode ?? "auto";
  const mode = modeOption === "auto" ? detectMode(grid) : modeOption;
  const minLenRaw = options.minLen ?? DEFAULT_MIN_WORD_LEN;
  const minLen = Number.isFinite(minLenRaw)
    ? Math.max(DEFAULT_MIN_WORD_LEN, Math.trunc(minLenRaw))
    : DEFAULT_MIN_WORD_LEN;
  const preferRightOnDualStart = options.preferRightOnDualStart ?? false;

  const slots =
    mode === "arrow" ? scanArrowSlots(grid, minLen) : scanClassicSlots(grid, minLen, preferRightOnDualStart);
  const numbering = buildStartNumbering(grid, slots);
  return {
    mode,
    slots,
    ...numbering,
  };
}

export function scanSlots(grid: Grid): Slot[] {
  return scanSlotsDetailed(grid).slots;
}

export function lengthStats(slots: Slot[]): Record<string, number> {
  const stats: Record<string, number> = { total: slots.length };
  for (const { len } of slots) stats[len] = (stats[len] ?? 0) + 1;
  return stats;
}
