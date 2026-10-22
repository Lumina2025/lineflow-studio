import { GIFEncoder } from './gif-encoder.js';

let encoder = null;

self.onmessage = ({ data }) => {
  try {
    if (!data || typeof data.type !== 'string') throw new Error('Missing GIF worker message type.');
    if (data.type === 'init') {
      encoder = null;
      encoder = new GIFEncoder(data.width, data.height, {
        delay: data.delay === undefined ? 50 : data.delay,
        referencePixels: data.referencePixels,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      if (!encoder) throw new Error('Initialize the GIF worker before sending a frame.');
      encoder.addFrame(data.pixels, { delay: data.delay });
      self.postMessage({ type: 'frame-done', index: data.index });
    } else if (data.type === 'finish') {
      if (!encoder) throw new Error('Initialize the GIF worker before finishing.');
      const bytes = encoder.finish();
      encoder = null;
      self.postMessage({ type: 'done', buffer: bytes.buffer }, [bytes.buffer]);
    } else throw new Error(`Unknown GIF worker message type: ${data.type}`);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
