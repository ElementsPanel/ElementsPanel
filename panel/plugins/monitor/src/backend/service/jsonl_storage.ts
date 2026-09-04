import fs from "fs-extra";
import path from "path";

/** Small append-only store used by the monitor's operation log. */
export class JsonlStorage {
  #rootDir: string;
  #maxLines: number;

  constructor(dir: string, maxLines = 200) {
    this.#rootDir = path.normalize(path.join(process.cwd(), "data", dir));
    this.#maxLines = maxLines;
  }

  private resolveFilePath(logicalPath: string) {
    if (["..", "\\", "//"].some((item) => logicalPath.includes(item))) {
      throw new Error(`Invalid path: ${logicalPath}`);
    }
    const filePath = path.normalize(path.join(this.#rootDir, `${logicalPath}.jsonl`));
    if (!fs.existsSync(path.dirname(filePath))) fs.mkdirsSync(path.dirname(filePath));
    return filePath;
  }

  async append(logicalPath: string, entry: object | object[], sync = false) {
    const entries = Array.isArray(entry) ? entry : [entry];
    const filePath = this.resolveFilePath(logicalPath);
    const lines = entries.map((item) => JSON.stringify(item)).join("\n") + "\n";
    if (sync) {
      fs.ensureFileSync(filePath);
      fs.appendFileSync(filePath, lines, "utf8");
    } else {
      await fs.ensureFile(filePath);
      await fs.appendFile(filePath, lines, "utf8");
    }
    await this.trim(logicalPath);
  }

  async readAll(logicalPath: string): Promise<object[]> {
    const filePath = this.resolveFilePath(logicalPath);
    if (!(await fs.pathExists(filePath))) return [];
    return (await fs.readFile(filePath, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  async query(logicalPath: string, predicate: (entry: any) => boolean) {
    return (await this.readAll(logicalPath)).filter(predicate);
  }

  async tail<T>(logicalPath: string, count: number) {
    return (await this.query(logicalPath, () => true)).slice(-count) as T[];
  }

  private async trim(logicalPath: string) {
    const entries = await this.readAll(logicalPath);
    if (entries.length <= this.#maxLines) return;
    const filePath = this.resolveFilePath(logicalPath);
    const content = entries.slice(-this.#maxLines).map((item) => JSON.stringify(item)).join("\n") + "\n";
    await fs.writeFile(filePath, content, "utf8");
  }
}
