#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePNG(size, drawPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      const i = y * rowLen + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// YouTube red rounded square with white magnifying glass.
function pixel(x, y, size) {
  const s = size;
  const cx = (x + 0.5) / s;
  const cy = (y + 0.5) / s;

  // Rounded square mask (radius 22% of side).
  const r = 0.22;
  const dx = Math.max(r - cx, cx - (1 - r), 0);
  const dy = Math.max(r - cy, cy - (1 - r), 0);
  const corner = Math.sqrt(dx * dx + dy * dy);
  if (corner > r) return [0, 0, 0, 0];

  // Magnifying glass: ring + handle. Glass center ~ (0.42, 0.42), radius 0.22.
  const gx = cx - 0.42;
  const gy = cy - 0.42;
  const gd = Math.sqrt(gx * gx + gy * gy);
  const ringOuter = 0.26;
  const ringInner = 0.16;
  const inRing = gd >= ringInner && gd <= ringOuter;

  // Handle: line from (0.62,0.62) to (0.82,0.82), width 0.10.
  const handleStart = 0.62;
  const handleEnd = 0.84;
  const onDiag = Math.abs(cx - cy) < 0.07;
  const alongDiag = cx + cy;
  const inHandle = onDiag && alongDiag > handleStart * 2 && alongDiag < handleEnd * 2;

  if (inRing || inHandle) return [255, 255, 255, 255];

  // YouTube red base.
  return [0xff, 0x00, 0x33, 255];
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = makePNG(size, pixel);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`wrote icons/icon${size}.png (${buf.length} bytes)`);
}
