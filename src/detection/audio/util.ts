import { Buffer } from 'buffer';

export function float32ToInt16Buffer(float32Array: Float32Array): Buffer {
  const int16Array = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff; // Convert to signed 16-bit PCM
  }

  return Buffer.from(int16Array.buffer);
}
