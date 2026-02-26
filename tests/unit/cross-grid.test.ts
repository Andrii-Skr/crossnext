import { describe, expect, it } from "vitest";
import { scanSlots, scanSlotsDetailed } from "@/utils/cross/grid";
import { parseFshBytes } from "@/utils/cross/parseFsh";
import type { Grid } from "@/utils/cross/types";

const CLASSIC_ROWS = [
  "#********#*#********#",
  "*#*#*#*#*****#*#*#*#*",
  "*#*#*****#*#*****#*#*",
  "*****#*#*****#*#*****",
  "*#*#*****#*#*****#*#*",
  "*****##*******##*****",
  "#*#*****#*#*#*****#*#",
  "****###*******###****",
  "#*#*****#*#*#*****#*#",
  "*****##*******##*****",
  "*#*#*****#*#*****#*#*",
  "*****#*#*****#*#*****",
  "*#*#*****#*#*****#*#*",
  "*#*#*#*#*****#*#*#*#*",
  "#********#*#********#",
];

function classicFixture(): Grid {
  const rows = CLASSIC_ROWS.length;
  const cols = CLASSIC_ROWS[0]?.length ?? 0;
  return {
    rows,
    cols,
    data: CLASSIC_ROWS,
    marker: "0E?",
    codes: Array.from({ length: rows }, () => Array(cols).fill(0)),
  };
}

function buildFshBytes(data: string[], codes?: number[][]): Uint8Array {
  const rows = data.length;
  const cols = data[0]?.length ?? 0;
  const marker = Buffer.from([0x30, 0x30 + cols, 0x30 + rows]);
  const out: number[] = [...Buffer.from("SHABLON  ", "ascii"), ...marker];

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const ch = data[row]?.[col];
      if (ch === "*") {
        out.push(0x01);
      } else if (ch === "#") {
        out.push(0x02);
      } else {
        const fallbackCode = ch === "↓" ? 0x01 : ch === "→" ? 0x08 : 0x07;
        out.push(0x04, codes?.[row]?.[col] ?? fallbackCode);
      }
    }
  }

  return Uint8Array.from(out);
}

describe("cross/grid", () => {
  it("supports classic mode (without arrows) and keeps both dirs on dual starts", () => {
    const detailed = scanSlotsDetailed(classicFixture());

    expect(detailed.mode).toBe("classic");
    expect(detailed.slots).toHaveLength(63);
    expect(detailed.starts).toHaveLength(63);
    expect(scanSlots(classicFixture())).toHaveLength(63);

    expect(detailed.numberGrid[0]?.[1]).toBe(1);
    expect(detailed.numberGrid[14]?.[12]).toBe(61);

    expect(detailed.starts.some((item) => item.r === 0 && item.c === 12 && item.dir === "right")).toBe(true);
    expect(detailed.starts.some((item) => item.r === 0 && item.c === 12 && item.dir === "down")).toBe(true);
    expect(detailed.starts.some((item) => item.r === 9 && item.c === 0 && item.dir === "right")).toBe(true);
    expect(detailed.starts.some((item) => item.r === 9 && item.c === 0 && item.dir === "down")).toBe(true);
  });

  it("keeps arrow mode behavior and creates both slots for ↘", () => {
    const grid: Grid = {
      rows: 3,
      cols: 3,
      data: ["↘**", "*#*", "***"],
      marker: "000",
      codes: [
        [0x07, 0x01, 0x01],
        [0x01, 0x02, 0x01],
        [0x01, 0x01, 0x01],
      ],
    };

    const detailed = scanSlotsDetailed(grid);
    expect(detailed.mode).toBe("arrow");
    expect(detailed.slots).toHaveLength(2);
    expect(detailed.starts).toHaveLength(2);
    expect(detailed.numberGrid[0]?.[0]).toBe(1);
    expect(detailed.starts.some((item) => item.r === 0 && item.c === 0 && item.dir === "right")).toBe(true);
    expect(detailed.starts.some((item) => item.r === 0 && item.c === 0 && item.dir === "down")).toBe(true);
  });

  it("parses fsh bytes and detects modes correctly", () => {
    const arrow = parseFshBytes(
      buildFshBytes(
        ["↘**", "*#*", "***"],
        [
          [0x07, 0x01, 0x01],
          [0x01, 0x02, 0x01],
          [0x01, 0x01, 0x01],
        ],
      ),
    );
    const classic = parseFshBytes(buildFshBytes(CLASSIC_ROWS));

    const arrowDetailed = scanSlotsDetailed(arrow);
    const classicDetailed = scanSlotsDetailed(classic);

    expect(arrowDetailed.mode).toBe("arrow");
    expect(arrowDetailed.slots).toHaveLength(2);
    expect(scanSlots(arrow)).toHaveLength(2);

    expect(classicDetailed.mode).toBe("classic");
    expect(classicDetailed.slots).toHaveLength(63);
    expect(scanSlots(classic)).toHaveLength(63);
  });
});
