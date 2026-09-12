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

  constructor(private readonly fallback: FileStorage, private readonly onError: (error?: unknown) => void) {}

  async initialize(url: string) {
    this.client = createClient({ url });
    this.client.on("error", this.onError);
    await this.client.connect();
  }

  private key(category: string, uuid: string) {
    if (["\\", "/", ".."].some((part) => uuid.includes(part))) {
      throw new Error(`UUID ${uuid} does not conform to specification`);
    }
    return `${category}:${uuid}`;
  }

  async store(category: string, uuid: string, object: any) {
    if (!this.client) return this.fallback.store(category, uuid, object);
    await this.client.set(this.key(category, uuid), JSON.stringify(object));
  }

  async load(category: string, classz: any, uuid: string) {
    if (!this.client) return this.fallback.load(category, classz, uuid);
    const value = await this.client.get(this.key(category, uuid));
    if (value == null) return null;
    const target = new classz();
    return defineAttr(target, JSON.parse(value));
  }

  async list(category: string) {
    if (!this.client) return this.fallback.list(category);
    const keys = await this.client.keys(`${category}:*`);
    return keys.map((key) => key.slice(category.length + 1));
  }

  async delete(category: string, uuid: string) {
    if (!this.client) return this.fallback.delete(category, uuid);
    await this.client.del(this.key(category, uuid));
  }
}

function defineAttr(target: any, source: any): any {
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
  private readonly redis = new RedisStorage(this.file, () => this.setStorageType(this.TYPE.FILE));
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
      this.logger?.warn("Due to an unrecoverable error, panel will temporarily store data in files.");
      this.setStorageType(this.TYPE.FILE);
    }
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
}
