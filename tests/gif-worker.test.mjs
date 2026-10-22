import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

// Exercise the exact browser worker module, adapting only its self/message API.
const moduleURL = new URL('../dist/gif-worker.js', import.meta.url).href;
const worker = new Worker(`
  const { parentPort } = require('node:worker_threads');
  globalThis.self = { postMessage: (message, transfer) => parentPort.postMessage(message, transfer) };
  parentPort.on('message', data => self.onmessage({ data }));
  import(${JSON.stringify(moduleURL)}).then(() => parentPort.postMessage({ type: 'boot' }));
`, { eval: true });
const request = async (message, transfer = []) => {
  const next = once(worker, 'message');
  worker.postMessage(message, transfer);
  return (await next)[0];
};
try {
  assert.equal((await once(worker, 'message'))[0].type, 'boot');
  assert.equal((await request({ type: 'finish' })).type, 'error');
  assert.equal((await request({ type: 'init', width: 0, height: 1 })).type, 'error');
  const reference = new Uint8Array(32 * 24 * 4).fill(255);
  assert.equal((await request({ type: 'init', width: 32, height: 24, delay: 50, referencePixels: reference.buffer }, [reference.buffer])).type, 'ready');
  assert.equal(reference.byteLength, 0, 'Reference transfer detaches sender memory.');
  for (let index = 0; index < 3; index++) {
    const pixels = new Uint8Array(32 * 24 * 4).fill(255);
    pixels.set([255, 0, 0, 255], (5 * 32 + 3 + index) * 4);
    assert.deepEqual(await request({ type: 'frame', pixels: pixels.buffer, index }, [pixels.buffer]), { type: 'frame-done', index });
    assert.equal(pixels.byteLength, 0, 'Frame transfer detaches sender memory.');
  }
  const result = await request({ type: 'finish' });
  assert.equal(result.type, 'done');
  assert.ok(result.buffer instanceof ArrayBuffer);
  assert.equal(new TextDecoder().decode(result.buffer.slice(0, 6)), 'GIF89a');
  assert.equal((await request({ type: 'finish' })).type, 'error');
  assert.equal((await request({ type: 'nonsense' })).type, 'error');
  console.log('GIF worker initialization, streaming acknowledgements, transfers, finish, and errors passed.');
} finally {
  await worker.terminate();
}
