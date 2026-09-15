import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeFaceCrop } from '../../src/technical/imaging/crop';
import { FaceDetectorClient } from '../../src/technical/imaging/faceClient';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('independent imaging failure regression', () => {
  it('does not approve a face when eye landmarks are absent or invalid', () => {
    for (const eyeCenter of [undefined, { x: NaN, y: 400 }, { x: 400, y: Infinity }]) {
      const result = computeFaceCrop({ width: 1000, height: 1000,
        faceBox: { x: 300, y: 300, width: 200, height: 220 }, eyeCenter });
      expect(result.requiresConfirmation).toBe(true);
      expect(Object.values(result.crop).every(Number.isFinite)).toBe(true);
    }
  });

  it('settles in-flight work and clears timers when the view closes', async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {
      onmessage = null;
      onerror = null;
      postMessage() { /* Simulate a worker that has not responded yet. */ }
      terminate = terminate;
    });
    const client = new FaceDetectorClient();
    const pending = client.detectFaces({ close: vi.fn() } as unknown as ImageBitmap, 1000, 1000);
    let settled = false;
    void pending.then(() => { settled = true; });
    client.terminate();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(settled).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
  });
});
