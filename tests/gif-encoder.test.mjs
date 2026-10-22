import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GIFEncoder } from '../dist/gif-encoder.js';

const temporary = await mkdtemp(join(tmpdir(), 'lineflow-gif-test-'));
const fixtures = [];
let randomState = 0x12345678;
const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return randomState >>> 0; };

async function fixture(name, width, height, frames, options = {}) {
  const encoder = new GIFEncoder(width, height, options);
  const framePaths = [];
  for (let i = 0; i < frames.length; i++) {
    const pixels = frames[i];
    encoder.addFrame(pixels, { delay: 40 + i * 20 });
    const rawPath = join(temporary, `${name}-${i}.rgba`);
    await writeFile(rawPath, pixels);
    framePaths.push(rawPath);
  }
  const bytes = encoder.finish();
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), 'GIF89a');
  assert.equal(bytes.at(-1), 0x3b);
  assert.throws(() => encoder.finish());
  assert.throws(() => encoder.addFrame(frames[0]));
  const path = join(temporary, `${name}.gif`);
  await writeFile(path, bytes);
  fixtures.push({ name, path, width, height, framePaths, tolerance: options.tolerance ?? 0 });
  console.log(`${name}: ${width} × ${height}, ${frames.length} frames, ${bytes.length} bytes`);
}

function cubeNoise(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = random() % 216;
    pixels[i] = Math.floor(value / 36) * 51;
    pixels[i + 1] = Math.floor(value / 6) % 6 * 51;
    pixels[i + 2] = value % 6 * 51;
    pixels[i + 3] = 255;
  }
  return pixels;
}

try {
  for (const length of [1, 2, 253, 254, 255, 256, 257, 511, 512, 4095, 4096, 8192]) {
    await fixture(`boundary-${length}`, length, 1, [cubeNoise(length, 1)]);
  }
  await fixture('dictionary-growth-and-reset', 512, 257, Array.from({ length: 3 }, () => cubeNoise(512, 257)));

  const width = 128, height = 64;
  const colors = [[255, 255, 255], [0, 0, 0], [23, 105, 230], [70, 198, 165], [244, 88, 122]];
  const frames = [0, 1, 2].map(shift => {
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      pixels.set(colors[(Math.floor(x / 11) + Math.floor(y / 7) + shift) % colors.length], index);
      pixels[index + 3] = 255;
    }
    return pixels;
  });
  await fixture('reference-palette-and-animation', width, height, frames, { referencePixels: frames[0] });

  const sparseFrames = [10, 18, 18, 100, 75].map(x => {
    const pixels = new Uint8Array(128 * 64 * 4).fill(255);
    for (let y = 20; y < 25; y++) for (let dx = 0; dx < 5; dx++) {
      pixels.set([0, 0, 255, 255], (y * 128 + x + dx) * 4);
    }
    return pixels;
  });
  await fixture('cropped-frames-and-duplicate', 128, 64, sparseFrames, { referencePixels: sparseFrames[0] });

  const gradient = new Uint8Array(256 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    gradient.set([x, y * 2, Math.floor((x + y) / 2), 255], (y * 256 + x) * 4);
  }
  await fixture('median-cut-many-colors', 256, 128, [gradient], { referencePixels: gradient, tolerance: 28 });

  assert.throws(() => new GIFEncoder(0, 10));
  assert.throws(() => new GIFEncoder(10.5, 10));
  assert.throws(() => new GIFEncoder(8193, 1));
  assert.throws(() => new GIFEncoder(8192, 8192));
  assert.throws(() => new GIFEncoder(1, 1, { delay: 0 }));
  assert.throws(() => new GIFEncoder(1, 1, { referencePixels: new Uint8Array(3) }));
  assert.throws(() => new GIFEncoder(1, 1).finish());
  assert.throws(() => new GIFEncoder(1, 1).addFrame(new Uint8Array(3)));
  assert.throws(() => new GIFEncoder(1, 1).addFrame(new Uint8Array(4), { delay: NaN }));

  const manifestPath = join(temporary, 'fixtures.json');
  await writeFile(manifestPath, JSON.stringify(fixtures));
  const validation = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image, ImageChops
fixtures = json.load(open(sys.argv[1]))
for fixture in fixtures:
    image = Image.open(fixture['path'])
    assert image.size == (fixture['width'], fixture['height'])
    assert image.n_frames == len(fixture['framePaths']), fixture['name']
    assert image.info['loop'] == 0
    for index, path in enumerate(fixture['framePaths']):
        image.seek(index)
        assert image.info['duration'] == 40 + index * 20
        expected = Image.frombytes('RGBA', image.size, open(path, 'rb').read()).convert('RGB')
        actual = image.convert('RGB')
        difference = ImageChops.difference(actual, expected)
        maximum = max(channel[1] for channel in difference.getextrema())
        assert maximum <= fixture['tolerance'], (fixture['name'], index, maximum)
print(f"Pillow decoded and pixel-checked {len(fixtures)} GIFs and {sum(len(f['framePaths']) for f in fixtures)} frames.")
`, manifestPath], { encoding: 'utf8' });
  process.stdout.write(validation.stdout);
  process.stderr.write(validation.stderr);
  assert.equal(validation.status, 0, 'Pillow must independently decode all GIF frames correctly.');
  console.log('GIF validation and misuse checks passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
