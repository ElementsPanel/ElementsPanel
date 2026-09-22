import { StorageSubsystem } from "mcsmanager-common";
import { createClient, type RedisClientType } from "redis";
import type { PanelPluginContext } from "../../../../src/app/plugin";

interface EntityStorage {
  store(category: string, uuid: string, object: any): Promise<void>;
  load(category: string, classz: any, uuid: string): Promise<any>;
  list(category: string): Promise<string[]>;
  delete(category: string, uuid: string): Promise<void>;
}

class FileStorage implements EntityStorage {
  private readonly storage = new StorageSubsystem();

  store(category: string, uuid: string, object: any) {
    this.storage.store(category, uuid, object);
    return Promise.resolve();
  }

  load(category: string, classz: any, uuid: string) {
    return Promise.resolve(this.storage.load(category, classz, uuid));
  }

  list(category: string) {
    return Promise.resolve(this.storage.list(category));
  }

  delete(category: string, uuid: string) {
    this.storage.delete(category, uuid);
    return Promise.resolve();
  }

  readDir(category: string) {
    return this.storage.readDir(category);
  }

  readFile(name: string) {
    return this.storage.readFile(name);
  }

  writeFile(name: string, data: string) {
    this.storage.writeFile(name, data);
  }
}

class RedisStorage implements EntityStorage {
  private client?: RedisClientType;

  // Connection settings must remain available before Redis can be initialized.
  constructor(private readonly bootstrap: FileStorage, private readonly onError: (error?: unknown) => void) {}

  async initialize(url: string) {
    await this.dispose();
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 5000 } });
    this.client.on("error", this.onError);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Redis connection timed out")), 10000);
        })
      ]);
    } catch (error) {
      await this.dispose();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async dispose() {
    const client = this.client;
    this.client = undefined;
    if (client?.isOpen) await client.disconnect();
  }

  private connectedClient() {
    if (!this.client?.isReady) throw new Error("Redis storage is unavailable");
    return this.client;
  }

  private category(category: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(category)) throw new Error("Invalid storage category");
    return category;
  }

  private key(category: string, uuid: string) {
    if (!uuid || ["\\", "/", "..", ":"].some((part) => uuid.includes(part))) {
      throw new Error(`UUID ${uuid} does not conform to specification`);
    }
    return `${this.category(category)}:${uuid}`;
  }

  async store(category: string, uuid: string, object: any) {
    if (category === "SystemConfig") return this.bootstrap.store(category, uuid, object);
    await this.connectedClient().set(this.key(category, uuid), JSON.stringify(object));
  }

  async load(category: string, classz: any, uuid: string) {
    if (category === "SystemConfig") return this.bootstrap.load(category, classz, uuid);
    const value = await this.connectedClient().get(this.key(category, uuid));
    if (value == null) return null;
    const target = new classz();
    return defineAttr(target, JSON.parse(value));
  }

  async list(category: string) {
    if (category === "SystemConfig") return this.bootstrap.list(category);
    const keys: string[] = [];
    for await (const key of this.connectedClient().scanIterator({ MATCH: `${this.category(category)}:*`, COUNT: 100 })) {
      keys.push(key.slice(category.length + 1));
    }
    return keys;
  }

  async delete(category: string, uuid: string) {
    if (category === "SystemConfig") return this.bootstrap.delete(category, uuid);
    await this.connectedClient().del(this.key(category, uuid));
  }
}

function defineAttr(target: any, source: any): any {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") return target;
  for (const key of Object.keys(target)) {
    const value = source?.[key];
    if (value === undefined) continue;
    if (Array.isArray(value) || value === null || typeof value !== "object") {
      target[key] = value;
      continue;
    }
    target[key] = defineAttr(target[key], value);
  }
  return target;
}

class PanelStorage {
  readonly TYPE = { FILE: 0, REDIS: 1 } as const;
  private readonly file = new FileStorage();
  private readonly redis = new RedisStorage(this.file, (error) => this.logger?.error("Redis storage error", error));
  private current: EntityStorage = this.file;
  private logger?: { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void };

  setLogger(logger: PanelStorage["logger"]) {
    this.logger = logger;
  }

  getStorage() {
    return this.current;
  }

  setStorageType(type: number) {
    this.current = type === this.TYPE.REDIS ? this.redis : this.file;
  }

  async initialize(url: string) {
    this.logger?.info("Attempting to connect to redis...");
    try {
      await this.redis.initialize(url);
      this.setStorageType(this.TYPE.REDIS);
      this.logger?.info("Connected to redis!");
    } catch (error) {
      this.logger?.error("Error occurred while trying to dial redis", error);
      throw error;
    }
  }

  async dispose() {
    await this.redis.dispose();
    this.current = this.file;
  }

  readDir(category: string) {
    return this.file.readDir(category);
  }

  readFile(name: string) {
    return this.file.readFile(name);
  }

  writeFile(name: string, data: string) {
    return this.file.writeFile(name, data);
  }
}

const storage = new PanelStorage();

export const inject: string[] = [];

export function apply(ctx: PanelPluginContext) {
  storage.setLogger(ctx.logger);
  ctx.set("storage", storage);
  ctx.on("dispose", () => storage.dispose());
}
