import path from "path";
import { StorageSubsystem } from "mcsmanager-common";

/** Bounded histories are committed as one atomic read/modify/write transaction. */
export class JsonlStorage {
  private readonly storage = new StorageSubsystem();

  constructor(
    private readonly directory: string,
    private readonly maxLines = 200
  ) {
    if (!Number.isSafeInteger(maxLines) || maxLines < 1) {
      throw new RangeError("maxLines must be a positive integer");
    }
  }

  private resolveFilePath(logicalPath: string) {
    if (
      !logicalPath ||
      path.isAbsolute(logicalPath) ||
      /[\\\0:]/.test(logicalPath) ||
      logicalPath.includes("..")
    ) {
      throw new Error(`Invalid path: ${logicalPath}`);
    }
    // Storage paths are logical, not filesystem paths: `StorageSubsystem` resolves
    // them against its data directory itself, and a backslash is what this method
    // rejects above. Joining with the platform separator would emit one on Windows —
    // the same file, but a different key for anything that stores the path itself.
    return path.posix.join(this.directory, `${logicalPath}.jsonl`);
  }

  private readSync(logicalPath: string): object[] {
    const file = this.resolveFilePath(logicalPath);
    if (!this.storage.fileExists(file)) return [];
    const entries: object[] = [];
    for (const line of this.storage.readFile(file).split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry === "object") entries.push(entry);
      } catch {
        // Ignore a truncated line left by an older non-atomic writer.
      }
    }
    return entries;
  }

  appendSync(logicalPath: string, entry: object | object[]) {
    const entries = Array.isArray(entry) ? entry : [entry];
    if (!entries.length) return;
    const content = [...this.readSync(logicalPath), ...entries]
      .slice(-this.maxLines)
      .map((item) => JSON.stringify(item))
      .join("\n");
    this.storage.writeFile(this.resolveFilePath(logicalPath), `${content}\n`);
  }

  async append(logicalPath: string, entry: object | object[], _sync = false) {
    this.appendSync(logicalPath, entry);
  }

  async readAll(logicalPath: string): Promise<object[]> {
    return this.readSync(logicalPath);
  }

  async query(logicalPath: string, predicate: (entry: any) => boolean) {
    return this.readSync(logicalPath).filter(predicate);
  }

  async tail<T>(logicalPath: string, count: number): Promise<T[]> {
    if (!Number.isSafeInteger(count) || count < 1) return [];
    return this.readSync(logicalPath).slice(-count) as T[];
  }
}
