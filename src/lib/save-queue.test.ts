import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveQueue } from './save-queue';

const queues: SaveQueue<string>[] = [];
afterEach(() => { for (const queue of queues.splice(0)) queue.cancelTimer(); });

describe('autosave queue', () => {
  it('serializes writes and saves the latest pending snapshot before concurrent flushes resolve', async () => {
    const writes: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const queue = new SaveQueue<string>(async value => {
      writes.push(value);
      if (value === 'first') await gate;
    }, () => undefined);
    queues.push(queue);
    queue.schedule('first');
    const firstFlush = queue.flush();
    queue.schedule('intermediate');
    queue.schedule('latest');
    const navigationFlush = queue.flush();
    expect(writes).toEqual(['first']);
    release();
    await Promise.all([firstFlush, navigationFlush]);
    expect(writes).toEqual(['first', 'latest']);
    expect(queue.dirty).toBe(false);
  });

  it('keeps a failed snapshot available for retry', async () => {
    const write = vi.fn<(value: string) => Promise<void>>().mockRejectedValueOnce(new Error('Storage full')).mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = new SaveQueue<string>(write, status);
    queues.push(queue);
    queue.schedule('recoverable drawing');
    await expect(queue.flush()).rejects.toThrow('Storage full');
    expect(queue.dirty).toBe(true);
    expect(status).toHaveBeenCalledWith('error', expect.any(Error));
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith('recoverable drawing');
    expect(queue.dirty).toBe(false);
  });

  it('preserves a newer pending drawing when an older write fails', async () => {
    let rejectWrite: (error: Error) => void = () => undefined;
    const write = vi.fn<(value: string) => Promise<void>>().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectWrite = reject; })).mockResolvedValue(undefined);
    const queue = new SaveQueue<string>(write, () => undefined);
    queues.push(queue);
    queue.schedule('older');
    const attempt = queue.flush();
    queue.schedule('newer');
    rejectWrite(new Error('Failed'));
    await expect(attempt).rejects.toThrow('Failed');
    await queue.flush();
    expect(write.mock.calls.map(([value]) => value)).toEqual(['older', 'newer']);
  });
});
