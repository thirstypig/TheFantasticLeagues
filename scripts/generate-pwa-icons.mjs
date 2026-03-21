#!/usr/bin/env node
/**
 * Generate minimal PWA placeholder PNG icons (no dependencies).
 *
 * Creates solid dark-blue square PNGs at 192x192 and 512x512.
 * These are functional placeholders — replace with real artwork later.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDeflateRaw } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'client', 'public');

// PNG CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function deflate(buf) {
  return new Promise((resolve, reject) => {
    const deflater = createDeflateRaw();
    const chunks = [];
    deflater.on('data', (c) => chunks.push(c));
    deflater.on('end', () => resolve(Buffer.concat(chunks)));
    deflater.on('error', reject);
    deflater.end(buf);
  });
}

async function generatePng(size, r, g, b) {
  // Build raw scanlines: filter byte (0) + RGB pixels per row
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    const offset = y * rowLen;
    raw[offset] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const compressed = await deflate(raw);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Wrap compressed data in zlib stream (header + data + adler32)
  const zlibHeader = Buffer.from([0x78, 0x01]); // zlib header (deflate, no dict)
  // Compute Adler-32 of uncompressed data
  let s1 = 1, s2 = 0;
  for (let i = 0; i < raw.length; i++) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE((s2 << 16) | s1, 0);
  const idatData = Buffer.concat([zlibHeader, compressed, adler]);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    iend,
  ]);
}

// Dark blue: #0f172a = rgb(15, 23, 42)
for (const size of [192, 512]) {
  const png = await generatePng(size, 15, 23, 42);
  const path = join(publicDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Wrote ${path} (${png.length} bytes)`);
}
