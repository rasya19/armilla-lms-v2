import { useMemo } from "react";

// Compact ISO-18004 QR Code Version 1..4 Byte-mode ECC-L SVG encoder (no external API dependencies)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeEcCodewords(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount);
  const work = [...data, ...new Array<number>(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      work[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return work.slice(data.length);
}

// Version specs for ECC-L (single block versions 1..4)
const VERSION_SPECS = [
  { version: 1, size: 21, dataBytes: 19, ecBytes: 7, align: [] as number[] },
  { version: 2, size: 25, dataBytes: 34, ecBytes: 10, align: [18] },
  { version: 3, size: 29, dataBytes: 55, ecBytes: 15, align: [22] },
  { version: 4, size: 33, dataBytes: 80, ecBytes: 20, align: [26] },
];

// Precomputed format info strings (ECC-L + mask 0..7)
const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

function buildQrMatrix(text: string): boolean[][] {
  const rawBytes = Array.from(new TextEncoder().encode(text));
  const spec = VERSION_SPECS.find((v) => v.dataBytes >= rawBytes.length + 2) ?? VERSION_SPECS[VERSION_SPECS.length - 1];
  const bytes = rawBytes.slice(0, spec.dataBytes - 2);

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  const maxDataBits = spec.dataBytes * 8;
  if (bits.length + 4 <= maxDataBits) pushBits(0, 4);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | (bits[i + j] ?? 0);
    dataWords.push(w);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataWords.length < spec.dataBytes) {
    dataWords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const ecWords = computeEcCodewords(dataWords, spec.ecBytes);
  const fullStream = [...dataWords, ...ecWords];

  const n = spec.size;
  const grid: Array<Array<number | null>> = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => null),
  );
  const reserved: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  );

  const setFixed = (r: number, c: number, val: number) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      grid[r][c] = val;
      reserved[r][c] = true;
    }
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const isBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isDark =
          !isBorder &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFixed(r, c, isDark ? 1 : 0);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    setFixed(6, i, i % 2 === 0 ? 1 : 0);
    setFixed(i, 6, i % 2 === 0 ? 1 : 0);
  }

  for (const pos of spec.align) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        setFixed(pos + dr, pos + dc, isDark ? 1 : 0);
      }
    }
  }

  setFixed(n - 8, 8, 1);

  // Reserve format areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = true;
    if (i < 7) reserved[n - 1 - i][8] = true;
  }

  // Fill data bits zigzag
  let bitIndex = 0;
  const totalBits = fullStream.length * 8;
  let dirUp = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < n; step++) {
      const row = dirUp ? n - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[row][c]) {
          let bit = 0;
          if (bitIndex < totalBits) {
            const byteVal = fullStream[bitIndex >> 3];
            bit = (byteVal >> (7 - (bitIndex & 7))) & 1;
            bitIndex++;
          }
          // Mask 0: (row + col) % 2 === 0
          if ((row + c) % 2 === 0) bit ^= 1;
          grid[row][c] = bit;
        }
      }
    }
    dirUp = !dirUp;
  }

  // Write Format Bits for mask 0
  const fmt = FORMAT_BITS_L[0];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    if (i < 6) grid[i][8] = bit;
    else if (i < 8) grid[i + 1][8] = bit;
    else grid[n - 15 + i][8] = bit;

    if (i < 8) grid[8][n - 1 - i] = bit;
    else if (i < 9) grid[8][7] = bit;
    else grid[8][14 - i] = bit;
  }

  return grid.map((row) => row.map((cell) => cell === 1));
}

export function QrCodeSvg({
  value,
  size = 96,
  className = "",
  label = "Kode QR Verifikasi",
}: {
  value: string;
  size?: number;
  className?: string;
  label?: string;
}) {
  const matrix = useMemo(() => buildQrMatrix(value || "ARMILLA-PKBM"), [value]);
  const n = matrix.length;
  const viewSize = n + 4; // 2-module quiet zone

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      role="img"
      aria-label={label}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={viewSize} height={viewSize} fill="#ffffff" rx="1" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + 2}
              y={r + 2}
              width={1}
              height={1}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
