interface Data {
  value: any;
  ttl: number;
}

export class SingletonMemoryRedis {
  private readonly envMap: Map<string, Data> = new Map();

  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.envMap) {
        if (data.ttl !== 0 && now >= data.ttl) {
          this.envMap.delete(key);
        }
      }
    }, 500);
    this.cleanupTimer.unref();
  }

  dispose() {
    clearInterval(this.cleanupTimer);
    this.envMap.clear();
  }

  get<T = any>(key: string): T | undefined {
    const data = this.envMap.get(key);
    if (!data) return undefined;
    if (data.ttl !== 0 && Date.now() >= data.ttl) {
      this.envMap.delete(key);
      return undefined;
    }
    return data.value as T;
  }

  set<T = any>(key: string, value: T, ttl: number = 0) {
    this.envMap.set(key, {
      value,
      ttl: ttl > 0 ? Date.now() + ttl * 1000 : 0
    });
  }

  ttl(key: string) {
    const data = this.envMap.get(key);
    if (!data) return 0;
    if (data.ttl === 0) return -1;
    return Math.max(0, Math.ceil((data.ttl - Date.now()) / 1000));
  }
}

// singleton
export const singletonMemoryRedis = new SingletonMemoryRedis();
