// One-off generator for PWA placeholder icons — run with `node scripts/generate-placeholder-icons.mjs`.
// These are solid navy/gold squares, NOT the final brand assets: swap them
// for real exports of the CEO Summit logo as part of E9-T01 (PWA & Mobile).
// Written with zero dependencies (raw PNG encoding via zlib) so it runs
// anywhere without pulling in an image library just for four placeholder files.

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/icons");

const NAVY = [0x1a, 0x2b, 0x5f];
const GOLD = [0xc9, 0xa8, 0x4c];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Solid background with a centered square "monogram" block in the accent color — a legible mark without needing font rasterization. */
function buildPixels(size, bg, accent, maskableInset) {
  const raw = Buffer.alloc(size * (1 + size * 3)); // filter byte + RGB per row
  const inset = maskableInset ? Math.round(size * 0.2) : 0;
  const markStart = Math.round(size * 0.32) + inset * 0;
  const markEnd = size - markStart;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const withinInset = x < inset || x >= size - inset || y < inset || y >= size - inset;
      const withinMark = x >= markStart && x < markEnd && y >= markStart && y < markEnd;
      const color = !withinInset && withinMark ? accent : bg;
      const px = rowStart + 1 + x * 3;
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
    }
  }
  return raw;
}

function writePng(filePath, size, { maskable = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = buildPixels(size, NAVY, GOLD, maskable);
  const idat = deflateSync(raw);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  writeFileSync(filePath, png);
  console.log(`wrote ${filePath} (${size}x${size}${maskable ? ", maskable" : ""})`);
}

mkdirSync(OUT_DIR, { recursive: true });
writePng(path.join(OUT_DIR, "icon-192.png"), 192);
writePng(path.join(OUT_DIR, "icon-512.png"), 512);
writePng(path.join(OUT_DIR, "icon-192-maskable.png"), 192, { maskable: true });
writePng(path.join(OUT_DIR, "icon-512-maskable.png"), 512, { maskable: true });
