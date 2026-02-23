import { whatsappLogger } from "../lib/logger";

type SendFn = () => Promise<void>;

interface QueueItem {
  sendFn: SendFn;
  resolve: () => void;
  reject: (err: Error) => void;
  label: string;
}

/**
 * Per-account send queue with token-bucket rate limiting.
 * All WhatsApp sends go through this queue to prevent burst patterns
 * that trigger WhatsApp spam detection and account bans.
 */
export class SendQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private delayMs: number;
  private burstLimit: number;
  private burstTokens: number;
  private lastSendTime = 0;

  constructor(opts?: { delayMs?: number; burstLimit?: number }) {
    this.delayMs = opts?.delayMs ?? 1000;
    this.burstLimit = opts?.burstLimit ?? 5;
    this.burstTokens = this.burstLimit;
  }

  /** Update rate limit config at runtime (from app_config) */
  updateConfig(delayMs: number, burstLimit: number): void {
    this.delayMs = delayMs;
    this.burstLimit = burstLimit;
  }

  /** Enqueue a send. Returns a promise that resolves/rejects when the message is actually sent. */
  enqueue(sendFn: SendFn, label = "message"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ sendFn, resolve, reject, label });
      whatsappLogger.debug(
        { queueLength: this.queue.length, label },
        "Message enqueued",
      );
      this.processNext();
    });
  }

  get length(): number {
    return this.queue.length;
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      const now = Date.now();
      const elapsed = now - this.lastSendTime;

      // Replenish burst tokens based on elapsed time
      const tokensToAdd = Math.floor(elapsed / this.delayMs);
      this.burstTokens = Math.min(
        this.burstLimit,
        this.burstTokens + tokensToAdd,
      );

      if (this.burstTokens > 0) {
        this.burstTokens--;
      } else {
        // Wait for rate limit delay + random jitter (100-500ms)
        const jitter = Math.floor(Math.random() * 400) + 100;
        const waitTime = this.delayMs - elapsed + jitter;
        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
      }

      try {
        await item.sendFn();
        this.lastSendTime = Date.now();
        item.resolve();
      } catch (err: any) {
        this.lastSendTime = Date.now();
        whatsappLogger.error(
          { err, label: item.label },
          "Send queue: message failed",
        );
        item.reject(err);
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
