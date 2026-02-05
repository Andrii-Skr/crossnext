import type { Cell, Grid } from "@/utils/cross/types";

// Browser-friendly FSH parser: accepts Uint8Array or ArrayBuffer

const HEADER_ASCII = "SHABLON  ";

// values read after 0x04 are not standalone codes
const down = new Set<number>([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x3d]);
const right = new Set<number>([0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]);
const diag = new Set<number>([
  0x07, 0x11, 0x13, 0x15, 0x0a, 0x0b, 0x0d, 0x19, 0x1a, 0x1c, 0x1d, 0x29, 0x21, 0x23, 0x39, 0x2a, 0x2b, 0x2c, 0x2f,
]);

function headerBytes() {
  const enc = new TextEncoder();
  return enc.encode(HEADER_ASCII);
}

function equalsPrefix(buf: Uint8Array, prefix: Uint8Array) {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function readCell(buf: Uint8Array, i: number): [Cell, number, number] {
  const b = buf[i];
  if (b === 0x01) return ["*", i + 1, b];
  if (b === 0x02) return ["#", i + 1, b];

  if (b === 0x04) {
    const dir = buf[i + 1];
    if (down.has(dir)) return ["↓", i + 2, dir];
    if (right.has(dir)) return ["→", i + 2, dir];
    if (diag.has(dir)) return ["↘", i + 2, dir];
    throw new Error(`unknown direction byte 0x${dir.toString(16)}`);
  }
  throw new Error(`unexpected byte 0x${b.toString(16)} at ${i}`);
}

function dimsFromMarker(marker: Uint8Array) {
  // marker = [0x32, X, Y] → cols = X-0x30, rows = Y-0x30
  const cols = marker[1] - 0x30;
  const rows = marker[2] - 0x30;
  if (cols <= 0 || rows <= 0) {
    throw new Error(
      `bad dimensions from marker ${Array.from(marker)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")}: ${cols}×${rows}`,
    );
  }
  const dec = new TextDecoder("ascii");
  return { cols, rows, marker: dec.decode(marker) };
}

export function parseFshBytes(input: Uint8Array | ArrayBuffer): Grid {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = headerBytes();

  if (!equalsPrefix(buf, header)) {
    throw new Error("file is not SHABLON format");
  }

  const markerBuf = buf.subarray(header.length, header.length + 3);
  const { cols: COLS, rows: ROWS, marker } = dimsFromMarker(markerBuf);

  let idx = header.length + 3;
  const grid: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill("*"));
  const codes: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const [ch, next, code] = readCell(buf, idx);
      grid[row][col] = ch;
      codes[row][col] = code;
      idx = next;
    }
  }

  return {
    rows: ROWS,
    cols: COLS,
    marker,
    data: grid.map((r) => r.join("")),
    codes,
  };
}
