import { randomUUID } from "crypto";
import path from "path";
import fs from "fs-extra";

export default class StorageSubsystem {
  public static readonly DATA_PATH = path.resolve(process.cwd(), "data");
  public static readonly INDEX_PATH = path.join(StorageSubsystem.DATA_PATH, "index");

  private resolvePath(name: string) {
    if (
      typeof name !== "string" ||
      !name ||
      /[\0:]/.test(name) ||
      path.isAbsolute(name) ||
      path.win32.isAbsolute(name)
    ) {
      throw new Error(`Invalid storage path: ${name}`);
    }
    const target = path.resolve(StorageSubsystem.DATA_PATH, name);
    const relative = path.relative(StorageSubsystem.DATA_PATH, target);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Invalid storage path: ${name}`);
    }
    const realRelative = path.relative(
      this.realPath(StorageSubsystem.DATA_PATH),
      this.realPath(target)
    );
    if (
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error(`Invalid storage path: ${name}`);
    }
    return target;
  }

  private realPath(target: string): string {
    if (fs.existsSync(target)) return fs.realpathSync(target);
    const parent = path.dirname(target);
    return parent === target ? target : path.join(this.realPath(parent), path.basename(target));
  }

  private entityPath(category: string, uuid: string) {
    if (typeof uuid !== "string" || !uuid || /[\\/\0:]/.test(uuid) || uuid.includes("..")) {
      throw new Error(`UUID ${uuid} does not conform to specification`);
    }
    this.resolvePath(category);
    return path.join(category, `${uuid}.json`);
  }

  public writeFile(name: string, data: string) {
    const targetPath = this.resolvePath(name);
    fs.ensureDirSync(path.dirname(targetPath));
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    const mode = fs.existsSync(targetPath) ? fs.statSync(targetPath).mode : 0o600;
    try {
      fs.writeFileSync(temporaryPath, data, { encoding: "utf8", flag: "wx", mode });
      fs.renameSync(temporaryPath, targetPath);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }

  public readFile(name: string) {
    return fs.readFileSync(this.resolvePath(name), "utf8");
  }

  public readDir(dirName: string) {
    const targetPath = this.resolvePath(dirName);
    if (!fs.existsSync(targetPath)) return [];
    return fs.readdirSync(targetPath).map((name) => path.join(dirName, name));
  }

  public deleteFile(name: string) {
    fs.removeSync(this.resolvePath(name));
  }

  public fileExists(name: string) {
    return fs.existsSync(this.resolvePath(name));
  }

  public store(category: string, uuid: string, object: any) {
    this.writeFile(this.entityPath(category, uuid), JSON.stringify(object, null, 4));
  }

  // Restore declared fields while keeping defaults for fields absent in older data.
  protected defineAttr(target: any, object: any): any {
    for (const key of Object.keys(target)) {
      if (!Object.prototype.hasOwnProperty.call(object, key) || object[key] === undefined) continue;
      const value = object[key];
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        target[key] !== null &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        this.defineAttr(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  public load(category: string, classz: any, uuid: string) {
    const file = this.entityPath(category, uuid);
    if (!this.fileExists(file)) return null;
    const object = JSON.parse(this.readFile(file));
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      throw new Error(`Invalid stored entity: ${file}`);
    }
    return this.defineAttr(new classz(), object);
  }

  public list(category: string) {
    const directory = this.resolvePath(category);
    if (!fs.existsSync(directory)) return [];
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5));
  }

  public delete(category: string, uuid: string) {
    this.deleteFile(this.entityPath(category, uuid));
  }
}
