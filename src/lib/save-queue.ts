export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/** Serial writes, last pending snapshot wins, and a failed snapshot remains retryable. */
export class SaveQueue<T> {
  private pending: { value: T } | undefined;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onStatus: (status: SaveStatus, error?: unknown) => void,
    private readonly delay = 600,
  ) {}

  get dirty(): boolean { return Boolean(this.pending || this.running); }

  schedule(value: T): void {
    this.pending = { value };
    this.onStatus('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.delay);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.pending) await this.flush();
      return;
    }
    if (!this.pending) return;
    const drain = async () => {
      this.onStatus('saving');
      while (this.pending) {
        const snapshot = this.pending;
        this.pending = undefined;
        try {
          await this.write(snapshot.value);
        } catch (error) {
          this.pending ??= snapshot;
          this.onStatus('error', error);
          throw error;
        }
      }
      this.onStatus('saved');
    };
    const job = drain();
    this.running = job;
    try { await job; } finally { if (this.running === job) this.running = undefined; }
  }

  cancelTimer(): void { clearTimeout(this.timer); }
}
