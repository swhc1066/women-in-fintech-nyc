/* Minimal PNG decode + pixel comparison, for visual regression checks.
 *
 * Handles the non-interlaced 8-bit RGB and RGBA that Chromium writes.
 * Bytes-per-pixel comes from the IHDR colour type — hardcoding 4 silently
 * decodes RGB files into noise that still compares equal to itself, which
 * looks exactly like a passing test.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decode(file) {
  const buf = fs.readFileSync(file);
  let off = 8;
  let width, height, bitDepth, colorType, interlace;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      bitDepth = buf[off + 16];
      colorType = buf[off + 17];
      interlace = buf[off + 20];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(off + 8, off + 8 + len));
    } else if (type === 'IEND') break;
    off += 12 + len;
  }

  const bpp = CHANNELS[colorType];
  if (bitDepth !== 8 || interlace !== 0 || !bpp) {
    throw new Error(`${file}: unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, data: out };
}

export function compare(fileA, fileB) {
  const A = decode(fileA);
  const B = decode(fileB);
  if (A.width !== B.width || A.height !== B.height) {
    return { sizeMismatch: true, a: `${A.width}x${A.height}`, b: `${B.width}x${B.height}` };
  }
  const stride = A.width * A.bpp;
  let differing = 0;
  const rows = [];
  for (let y = 0; y < A.height; y++) {
    let rowDiff = 0;
    for (let x = 0; x < A.width; x++) {
      const i = y * stride + x * A.bpp;
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) rowDiff++;
    }
    if (rowDiff) rows.push({ y, rowDiff });
    differing += rowDiff;
  }
  const total = A.width * A.height;
  return { differing, total, pct: (100 * differing) / total, rows, width: A.width, height: A.height };
}

export function ranges(rows) {
  const out = [];
  let cur = null;
  for (const r of rows) {
    if (cur && r.y === cur.end + 1) { cur.end = r.y; cur.max = Math.max(cur.max, r.rowDiff); }
    else { cur = { start: r.y, end: r.y, max: r.rowDiff }; out.push(cur); }
  }
  return out;
}
