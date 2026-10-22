/** A dependency-free, streaming GIF89a encoder for opaque RGBA canvas frames. */
export const MAX_DIMENSION = 8192;
export const MAX_PIXELS = 16_777_216;

const FALLBACK_COLORS = [
  ...Array.from({ length: 16 }, (_, i) => [i * 17, i * 17, i * 17]),
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
  [0, 255, 255], [255, 0, 255], [255, 128, 0], [0, 160, 160],
  [128, 64, 255], [255, 64, 160], [0, 64, 128], [0, 128, 64],
  [128, 0, 128], [128, 64, 0], [64, 160, 255], [128, 255, 192],
];

function rgbaView(value, expectedLength, label) {
  let view;
  if (value instanceof ArrayBuffer) view = new Uint8Array(value);
  else if (ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1) {
    view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else throw new TypeError(`${label} must be an RGBA byte array or ArrayBuffer.`);
  if (view.length !== expectedLength) {
    throw new RangeError(`${label} has ${view.length} bytes; expected ${expectedLength}.`);
  }
  return view;
}

function delayCentiseconds(delay) {
  if (!Number.isFinite(delay) || delay <= 0 || delay > 655_350) {
    throw new RangeError('Frame delay must be greater than 0 and at most 655350 milliseconds.');
  }
  return Math.max(1, Math.round(delay / 10));
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.chunk = new Uint8Array(65_536);
    this.position = 0;
    this.length = 0;
  }
  byte(value) {
    if (this.position === this.chunk.length) {
      this.chunks.push(this.chunk);
      this.chunk = new Uint8Array(65_536);
      this.position = 0;
    }
    this.chunk[this.position++] = value;
    this.length++;
  }
  uint16(value) { this.byte(value & 255); this.byte(value >>> 8); }
  bytes(values) { for (let i = 0; i < values.length; i++) this.byte(values[i]); }
  ascii(value) { for (let i = 0; i < value.length; i++) this.byte(value.charCodeAt(i)); }
  finish() {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
    result.set(this.chunk.subarray(0, this.position), offset);
    this.chunks = [];
    this.chunk = null;
    return result;
  }
}

function makeBox(colors) {
  let weight = 0;
  const sums = [0, 0, 0];
  const squares = [0, 0, 0];
  for (const color of colors) {
    weight += color.count;
    for (let c = 0; c < 3; c++) {
      sums[c] += color.rgb[c] * color.count;
      squares[c] += color.rgb[c] ** 2 * color.count;
    }
  }
  const variance = squares.map((sum, c) => Math.max(0, sum - sums[c] ** 2 / weight));
  const channel = variance.indexOf(Math.max(...variance));
  return { colors, weight, sums, channel, score: colors.length > 1 ? variance[channel] : -1 };
}

function createPalette(reference) {
  if (!reference) {
    // A full RGB cube plus evenly spaced grays works before a reference is available.
    const palette = [];
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
      palette.push([r * 51, g * 51, b * 51]);
    }
    for (let i = 0; i < 40; i++) { const v = Math.round(i * 255 / 39); palette.push([v, v, v]); }
    return palette;
  }

  const counts = new Uint32Array(32_768);
  const sumsR = new Float64Array(32_768);
  const sumsG = new Float64Array(32_768);
  const sumsB = new Float64Array(32_768);
  const count = reference.length / 4;
  const stride = Math.max(1, Math.ceil(count / 300_000));
  for (let pixel = 0; pixel < count; pixel += stride) {
    const offset = pixel * 4;
    const alpha = reference[offset + 3];
    const r = alpha === 255 ? reference[offset] : Math.round(255 + (reference[offset] - 255) * alpha / 255);
    const g = alpha === 255 ? reference[offset + 1] : Math.round(255 + (reference[offset + 1] - 255) * alpha / 255);
    const b = alpha === 255 ? reference[offset + 2] : Math.round(255 + (reference[offset + 2] - 255) * alpha / 255);
    const index = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
    counts[index]++;
    sumsR[index] += r; sumsG[index] += g; sumsB[index] += b;
  }
  const colors = [];
  for (let i = 0; i < counts.length; i++) {
    if (counts[i]) colors.push({ count: counts[i], rgb: [sumsR[i] / counts[i], sumsG[i] / counts[i], sumsB[i] / counts[i]] });
  }
  const boxes = [makeBox(colors)];
  while (boxes.length < 224) {
    let splitIndex = -1;
    let score = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].score > score) { score = boxes[i].score; splitIndex = i; }
    }
    if (splitIndex === -1) break;
    const box = boxes[splitIndex];
    box.colors.sort((a, b) => a.rgb[box.channel] - b.rgb[box.channel]);
    let accumulated = 0;
    let split = 0;
    do { accumulated += box.colors[split++].count; }
    while (accumulated < box.weight / 2 && split < box.colors.length - 1);
    boxes[splitIndex] = makeBox(box.colors.slice(0, split));
    boxes.push(makeBox(box.colors.slice(split)));
  }
  const palette = boxes.map(box => box.sums.map(sum => Math.round(sum / box.weight)));
  palette.push(...FALLBACK_COLORS);
  while (palette.length < 256) palette.push([255, 255, 255]);
  return palette;
}

function writeLZW(writer, pixels) {
  // Eight-bit indexed input uses 9-bit codes initially, growing to 12 bits.
  writer.byte(8);
  const block = new Uint8Array(255);
  let blockLength = 0;
  let pending = 0;
  let pendingBits = 0;
  let codeSize = 9;
  let nextCode = 258;
  const dictionary = new Map();
  const flushBlock = () => {
    if (blockLength) { writer.byte(blockLength); writer.bytes(block.subarray(0, blockLength)); blockLength = 0; }
  };
  const byte = value => {
    block[blockLength++] = value;
    if (blockLength === 255) flushBlock();
  };
  const code = value => {
    pending |= value << pendingBits;
    pendingBits += codeSize;
    while (pendingBits >= 8) { byte(pending & 255); pending >>>= 8; pendingBits -= 8; }
  };
  const dataCode = value => {
    code(value);
    // The decoder creates each dictionary entry one emitted code behind us.
    // Grow only AFTER emitting the code that lets it reach this boundary.
    if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
  };
  code(256); // Clear table.
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const suffix = pixels[i];
    const key = prefix << 8 | suffix;
    const found = dictionary.get(key);
    if (found !== undefined) { prefix = found; continue; }
    dataCode(prefix);
    if (nextCode < 4096) dictionary.set(key, nextCode++);
    else {
      code(256);
      dictionary.clear();
      codeSize = 9;
      nextCode = 258;
    }
    prefix = suffix;
  }
  dataCode(prefix);
  code(257); // End of information.
  if (pendingBits) byte(pending & 255);
  flushBlock();
  writer.byte(0); // End image-data sub-blocks.
}

export class GIFEncoder {
  constructor(width, height, { delay = 50, referencePixels } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
      throw new RangeError(`GIF dimensions must be 1–${MAX_DIMENSION}, with at most ${MAX_PIXELS.toLocaleString('en-US')} pixels.`);
    }
    this.width = width;
    this.height = height;
    this.frameBytes = width * height * 4;
    this.defaultDelay = delayCentiseconds(delay);
    this.frameCount = 0;
    this.finished = false;
    this.previousFrame = null;
    const reference = referencePixels === undefined ? null : rgbaView(referencePixels, this.frameBytes, 'Reference pixels');
    this.palette = createPalette(reference);
    this.colorLookup = new Int16Array(32_768).fill(-1);
    this.writer = new ByteWriter();
    const writer = this.writer;
    writer.ascii('GIF89a');
    writer.uint16(width); writer.uint16(height);
    writer.bytes([0xf7, 0, 0]); // Global 256-color palette, 8-bit color resolution.
    for (const color of this.palette) writer.bytes(color);
    writer.bytes([0x21, 0xff, 11]);
    writer.ascii('NETSCAPE2.0');
    writer.bytes([3, 1, 0, 0, 0]); // Infinite looping.
  }

  addFrame(rgbaPixels, { delay } = {}) {
    if (this.finished) throw new Error('Cannot add a frame after finish().');
    const pixels = rgbaView(rgbaPixels, this.frameBytes, 'Frame pixels');
    const frameDelay = delay === undefined ? this.defaultDelay : delayCentiseconds(delay);
    const indexed = new Uint8Array(this.width * this.height);
    let minX = this.width, minY = this.height, maxX = -1, maxY = -1;
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      const alpha = pixels[i + 3];
      const r = alpha === 255 ? pixels[i] : Math.round(255 + (pixels[i] - 255) * alpha / 255);
      const g = alpha === 255 ? pixels[i + 1] : Math.round(255 + (pixels[i + 1] - 255) * alpha / 255);
      const b = alpha === 255 ? pixels[i + 2] : Math.round(255 + (pixels[i + 2] - 255) * alpha / 255);
      const key = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3;
      let selected = this.colorLookup[key];
      if (selected === -1) {
        let minDistance = Infinity;
        for (let p = 0; p < 256; p++) {
          const color = this.palette[p];
          const dr = r - color[0], dg = g - color[1], db = b - color[2];
          const distance = 2 * dr * dr + 4 * dg * dg + db * db;
          if (distance < minDistance) { minDistance = distance; selected = p; if (!distance) break; }
        }
        this.colorLookup[key] = selected;
      }
      indexed[j] = selected;
      if (this.previousFrame && this.previousFrame[j] !== selected) {
        const x = j % this.width, y = Math.floor(j / this.width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    // Keep unchanged screenshot content on the GIF canvas. Only animated regions
    // need another image block; duplicate frames use a single pixel plus delay.
    let left = 0, top = 0, width = this.width, height = this.height;
    if (this.previousFrame) {
      if (maxX < 0) { width = 1; height = 1; }
      else { left = minX; top = minY; width = maxX - minX + 1; height = maxY - minY + 1; }
    }
    let framePixels = indexed;
    if (width !== this.width || height !== this.height) {
      framePixels = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const offset = (top + y) * this.width + left;
        framePixels.set(indexed.subarray(offset, offset + width), y * width);
      }
    }
    const writer = this.writer;
    writer.bytes([0x21, 0xf9, 4, 4]); // GCE: retain the fully opaque current frame.
    writer.uint16(frameDelay); writer.bytes([0, 0]);
    writer.byte(0x2c);
    writer.uint16(left); writer.uint16(top);
    writer.uint16(width); writer.uint16(height); writer.byte(0);
    writeLZW(writer, framePixels);
    this.previousFrame = indexed;
    this.frameCount++;
    return this;
  }

  finish() {
    if (this.finished) throw new Error('finish() may only be called once.');
    if (!this.frameCount) throw new Error('Add at least one frame before finish().');
    this.finished = true;
    this.writer.byte(0x3b);
    const output = this.writer.finish();
    this.writer = null;
    this.previousFrame = null;
    return output;
  }
}
