import { whatsappLogger } from "../lib/logger";

/**
 * Lightweight CacheStore implementation using Map with TTL.
 * Implements the Baileys CacheStore interface: get, set, del, flushAll.
 */
export class MapCacheStore {
  private store = new Map<string, { value: any; expiresAt: number }>();
  private maxSize: number;
  private defaultTtlMs: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(opts: {
    maxSize?: number;
    defaultTtlMs?: number;
    cleanupIntervalMs?: number;
  }) {
    this.maxSize = opts.maxSize ?? 1000;
    this.defaultTtlMs = opts.defaultTtlMs ?? 5 * 60 * 1000; // 5 min default
    this.cleanupTimer = setInterval(
      () => this.evictExpired(),
      opts.cleanupIntervalMs ?? 60_000,
    );
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.defaultTtlMs,
    });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  flushAll(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      whatsappLogger.debug(
        { evicted, remaining: this.store.size },
        "Cache eviction completed",
      );
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}

/**
 * Stores outgoing message content for Baileys retry mechanism.
 * When Baileys needs to retry a failed send, it calls getMessage(key)
 * to retrieve the original proto.IMessage content.
 */
export class MessageStore {
  private cache: MapCacheStore;

  constructor() {
    this.cache = new MapCacheStore({
      maxSize: 1000,
      defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
      cleanupIntervalMs: 5 * 60 * 1000,
    });
  }

  store(msgId: string, message: any): void {
    this.cache.set(msgId, message);
  }

  async getMessage(key: {
    id?: string | null;
  }): Promise<any | undefined> {
    if (!key.id) return undefined;
    return this.cache.get(key.id);
  }

  destroy(): void {
    this.cache.destroy();
  }
}
