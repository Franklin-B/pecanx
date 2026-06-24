// Generates the extension icon (icon.png, 128x128) with no dependencies.
//
// The motif is PecanX's own metaphor: a hard shell (ring) around an edible
// kernel (disc with a seam). Rendered at 2x and box-downsampled for smooth edges,
// then encoded as a PNG by hand (IHDR / IDAT / IEND with CRC32).
//
//   node scripts/make-icon.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const N = 128, SS = 2, M = N * SS; // final size, supersample factor, render size
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#14171d");      // dark background (matches the playground theme)
const SHELL = hex("#a8682b");   // pecan shell
const KERNEL = hex("#e0a965");  // lighter kernel
const SEAM = hex("#b07a38");    // the kernel's central groove

const cx = M / 2, cy = M / 2;
const Ro = 47 * SS, Ri = 33 * SS; // shell outer / inner radius

// Render supersampled with hard edges.
const big = new Uint8Array(M * M * 3);
for (let y = 0; y < M; y++) {
  for (let x = 0; x < M; x++) {
    let c = BG;
    const d = Math.hypot(x - cx, y - cy);
    if (d <= Ro && d >= Ri) c = SHELL;
    else if (d < Ri) c = Math.abs(x - cx) < 2.4 * SS ? SEAM : KERNEL;
    const o = (y * M + x) * 3;
    big[o] = c[0]; big[o + 1] = c[1]; big[o + 2] = c[2];
  }
}

// Box-downsample SSxSS -> 1 (opaque, so no alpha bleed); emit RGBA.
const img = new Uint8Array(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const o = ((y * SS + dy) * M + (x * SS + dx)) * 3;
      r += big[o]; g += big[o + 1]; b += big[o + 2];
    }
    const n = SS * SS, o = (y * N + x) * 4;
    img[o] = Math.round(r / n); img[o + 1] = Math.round(g / n); img[o + 2] = Math.round(b / n); img[o + 3] = 255;
  }
}

// --- minimal PNG encoder ----------------------------------------------------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; for (let x = 0; x < N * 4; x++) raw[y * (N * 4 + 1) + 1 + x] = img[y * N * 4 + x]; }
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), "..", "icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} — ${N}x${N}, ${png.length} bytes`);
