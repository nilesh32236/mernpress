#!/usr/bin/env node
/**
 * Compare two PNG screenshots and report how much changed and where.
 *
 * The visual-baseline suite compares full-page screenshots, so an intentional
 * UI change (a new toolbar button, a recoloured panel) has to be told apart
 * from an accidental layout shift. This tool answers "is the diff limited to
 * the area I meant to change?" without any dependency: it decodes the PNGs
 * with `node:zlib` (8-bit, non-interlaced, which is what Playwright writes) and
 * walks the pixels.
 *
 * Usage:
 *   node scripts/png-diff.mjs <old.png> <new.png>          # bounding box + count
 *   node scripts/png-diff.mjs --rows <old.png> <new.png>   # changed row bands
 *   node scripts/png-diff.mjs --shift <old.png> <new.png>  # best (dx, dy) offset
 *
 * It prints JSON on stdout and always exits 0 so it can be used in a report;
 * a usage or decode error exits 1 with a message on stderr.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function fail(message) {
  process.stderr.write(`png-diff: ${message}\n`);
  process.exit(1);
}

/** Decode a PNG to raw 8-bit RGB(A) scanlines. */
function decode(path) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    fail(`cannot read ${path}`);
  }
  if (buffer.readUInt32BE(0) !== 0x89504e47) fail(`${path} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) fail(`${path} uses a ${bitDepth}-bit depth; only 8-bit is supported`);
  if (interlace !== 0) fail(`${path} is interlaced; only non-interlaced PNGs are supported`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) fail(`${path} uses colour type ${colorType}; unsupported`);

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const line = raw.subarray(position, position + stride);
    position += stride;
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      current[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function pixelDiffers(left, right, leftIndex, rightIndex) {
  return (
    left.pixels[leftIndex] !== right.pixels[rightIndex] ||
    left.pixels[leftIndex + 1] !== right.pixels[rightIndex + 1] ||
    left.pixels[leftIndex + 2] !== right.pixels[rightIndex + 2]
  );
}

function compare(left, right) {
  if (left.width !== right.width || left.height !== right.height) {
    return { sizeChanged: true, old: [left.width, left.height], new: [right.width, right.height] };
  }
  let changed = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  const rows = new Array(left.height).fill(0);
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const leftIndex = y * left.width * left.channels + x * left.channels;
      const rightIndex = y * right.width * right.channels + x * right.channels;
      if (!pixelDiffers(left, right, leftIndex, rightIndex)) continue;
      changed += 1;
      rows[y] += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    width: left.width,
    height: left.height,
    changed,
    box: changed ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
    rows,
  };
}

function bestShift(left, right, maxShift = 2) {
  if (left.width !== right.width || left.height !== right.height) {
    return { sizeChanged: true, old: [left.width, left.height], new: [right.width, right.height] };
  }
  const results = [];
  for (let dy = -maxShift; dy <= maxShift; dy += 1) {
    for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      let changed = 0;
      for (let y = 0; y < left.height; y += 1) {
        const shiftedY = y + dy;
        if (shiftedY < 0 || shiftedY >= right.height) continue;
        for (let x = 0; x < left.width; x += 1) {
          const shiftedX = x + dx;
          if (shiftedX < 0 || shiftedX >= right.width) continue;
          const leftIndex = y * left.width * left.channels + x * left.channels;
          const rightIndex = shiftedY * right.width * right.channels + shiftedX * right.channels;
          if (pixelDiffers(left, right, leftIndex, rightIndex)) changed += 1;
        }
      }
      results.push({ dx, dy, changed });
    }
  }
  results.sort((a, b) => a.changed - b.changed);
  return { best: results.slice(0, 5) };
}

const args = process.argv.slice(2);
const mode = args[0]?.startsWith('--') ? args.shift().slice(2) : 'box';
if (args.length !== 2) {
  fail('usage: node scripts/png-diff.mjs [--rows|--shift] <old.png> <new.png>');
}
const left = decode(args[0]);
const right = decode(args[1]);

if (mode === 'shift') {
  process.stdout.write(`${JSON.stringify(bestShift(left, right))}\n`);
} else {
  const result = compare(left, right);
  if (result.sizeChanged) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (mode === 'rows') {
    const bands = [];
    let start = -1;
    for (let y = 0; y <= result.rows.length; y += 1) {
      const count = y < result.rows.length ? result.rows[y] : 0;
      if (count > 0 && start === -1) start = y;
      if (count === 0 && start !== -1) {
        const total = result.rows.slice(start, y).reduce((sum, value) => sum + value, 0);
        bands.push({ from: start, to: y - 1, changed: total });
        start = -1;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ width: result.width, height: result.height, bands })}\n`,
    );
  } else {
    // The row histogram is only needed by --rows; keep the summary compact.
    delete result.rows;
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}
