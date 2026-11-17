import fs from "fs-extra";
import os from "os";
import path from "path";
import { javaExecutableCommand } from "../../../../../../core/common/src/java";
import { JavaInfo } from "./java_info";
import { findJavaExecutable, installJavaArchive } from "./java_install";
import { MslJavaSource } from "./msl_java";

export interface JavaManagerDependencies {
  defaultJavaDataPath?: string;
  translate(key: string): string;
  unzip(directory: string, file: string, destination: string): Promise<boolean>;
  logger?: { info(...args: any[]): void; warn(...args: any[]): void };
  backgroundTasks?: import("../../../../../runtime/daemon/src/backend/service/background_tasks").BackgroundTasks;
}

export type JavaManagerInfo = IJavaInfo & { name: string; version?: string };

export class JavaManager {
  private readonly javaDataDir: string;
  private readonly source: MslJavaSource;
  private readonly jobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private disposed = false;
  public readonly javaList = new Map<string, IJavaRuntime>();
  public readonly ready: Promise<void>;

  constructor(private readonly dependencies: JavaManagerDependencies) {
    this.javaDataDir = path.resolve(
      dependencies.defaultJavaDataPath || path.join(process.cwd(), "data/JavaData")
    );
    fs.ensureDirSync(this.javaDataDir);
    this.source = new MslJavaSource(dependencies.translate);
    this.ready = this.loadJavaList();
  }

  public getJavaDataDir() {
    return this.javaDataDir;
  }

  async loadJavaList() {
    for (const file of await fs.readdir(this.javaDataDir)) {
      try {
        const javaPath = path.join(this.javaDataDir, file);
        const dir = await fs.lstat(javaPath);
        if (!dir.isDirectory()) continue;
        const infoPath = path.join(javaPath, "java_info.json");
        if (!fs.existsSync(infoPath)) continue;
        const config = await fs.readJson(infoPath);
        const info = new JavaInfo(config.name, config.installTime ?? Date.now(), config.version);
        // A metadata record must never point at another runtime's managed directory.
        if (info.fullname !== file) continue;
        info.path = config.path;
        info.error = config.error;
        info.progress = config.progress;
        if (config.downloading) {
          await fs.remove(path.join(javaPath, ".install"));
          await fs.remove(path.join(javaPath, "runtime"));
          info.path = undefined;
          info.error = this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED");
          info.progress = undefined;
        }
        this.javaList.set(info.fullname, { info, path: javaPath, usingInstances: [] });
        if (config.downloading) this.updateJavaInfo(info);
      } catch (error) {
        // A damaged or concurrently removed record must not hide healthy runtimes.
        this.dependencies.logger?.warn(`Cannot load Java runtime: ${file}`, error);
      }
    }
  }

  list() {
    return Array.from(this.javaList.values());
  }
  getJava(id: string) {
    return this.javaList.get(id);
  }
  exists(id: string) {
    return this.javaList.has(id);
  }
  getAvailableVersions() {
    return this.source.versions();
  }

  async getJavaDownloadUrl(info: JavaManagerInfo) {
    return (await this.source.download(info.version || "")).url;
  }

  private save(info: JavaManagerInfo) {
    const javaPath = path.join(this.javaDataDir, info.fullname);
    fs.ensureDirSync(javaPath);
    // Store beside the runtime, including when defaultJavaDataPath is customized.
    const temporary = path.join(javaPath, "java_info.json.tmp");
    fs.writeJsonSync(temporary, {
      name: info.name,
      path: info.path,
      version: info.version,
      installTime: info.installTime,
      downloading: info.downloading,
      progress: info.progress,
      error: info.error
    });
    fs.renameSync(temporary, path.join(javaPath, "java_info.json"));
  }

  addJava(info: JavaManagerInfo) {
    if (
      !info.fullname ||
      path.basename(info.fullname) !== info.fullname ||
      [".", ".."].includes(info.fullname) ||
      /[\\/:*?"<>|\0]/.test(info.fullname)
    ) {
      throw new Error(this.dependencies.translate("TXT_CODE_COMMON_THE_NAME_CONTAINS_INVALID_CHARACTERS_PLEASE_MODIFY_THE_NAME"));
    }
    if (this.exists(info.fullname))
      throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_ALREADY_EXISTS"));
    this.save(info);
    this.javaList.set(info.fullname, {
      info,
      path: path.join(this.javaDataDir, info.fullname),
      usingInstances: []
    });
  }

  updateJavaInfo(info: JavaManagerInfo) {
    if (this.javaList.has(info.fullname)) this.save(info);
  }

  /** One shared installation per node/version; callers can poll the persisted runtime state. */
  async startInstall(version: string): Promise<IJavaRuntime> {
    await this.ready;
    if (this.disposed) throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED"));
    if (typeof version !== "string" || !/^[1-9][0-9]{0,2}$/.test(version))
      throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INVALID_VERSION"));
    const id = `msl_${version}`;
    const existing = this.javaList.get(id);
    if (existing && !existing.info.error) return existing;
    if (!(await this.source.versions()).versions.includes(version))
      throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INVALID_VERSION"));
    if (this.disposed) throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED"));
    // Another request may have started this version while the catalogue loaded.
    const current = this.javaList.get(id);
    if (current && (!current.info.error || this.jobs.has(id))) return current;
    if (current?.usingInstances.length)
      throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_IS_CURRENTLY_RUNNING"));
    const info = new JavaInfo("msl", Date.now(), version);
    info.downloading = true;
    const runtime = { info, path: path.join(this.javaDataDir, id), usingInstances: [] };
    this.save(info);
    this.javaList.set(id, runtime);
    const job = { controller: new AbortController(), done: Promise.resolve() };
    this.jobs.set(id, job);
    job.done = this.install(info, job.controller.signal).finally(() => this.jobs.delete(id));
    const tasks = this.dependencies.backgroundTasks;
    tasks?.progress(() => ({ current: info.progress || 0, total: 100 }), () => job.controller.abort());
    tasks?.follow(job.done.then(() => { if (info.error) throw new Error(info.error); }));
    return runtime;
  }

  private async install(info: JavaInfo, signal: AbortSignal) {
    const directory = path.join(this.javaDataDir, info.fullname);
    try {
      const download = await this.source.download(info.version!);
      if (signal.aborted)
        throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED"));
      await fs.remove(path.join(directory, "runtime"));
      this.dependencies.logger?.info(`Installing Java from MSL: ${info.fullname}`);
      info.path = await installJavaArchive({
        download,
        directory,
        signal,
        platform: os.platform(),
        translate: this.dependencies.translate,
        unzip: this.dependencies.unzip,
        progress: (value) => {
          info.progress = value;
        }
      });
      if (signal.aborted)
        throw new Error(this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED"));
      info.error = undefined;
      info.progress = 100;
      this.dependencies.logger?.info(`Java installation completed: ${info.fullname}`);
    } catch (error: any) {
      info.error = signal.aborted
        ? this.dependencies.translate("TXT_CODE_JAVA_MSL_INTERRUPTED")
        : error.message;
      info.path = undefined;
      info.progress = undefined;
      await fs.remove(path.join(directory, "runtime")).catch(() => {});
      this.dependencies.logger?.warn(`Java installation failed: ${info.fullname}`, info.error);
    } finally {
      info.downloading = false;
      try {
        this.updateJavaInfo(info);
      } catch (error: any) {
        info.error = `${this.dependencies.translate("TXT_CODE_JAVA_MSL_PERSIST_FAILED")} ${
          error.message
        }`;
        this.dependencies.logger?.warn(`Cannot save Java installation: ${info.fullname}`, error);
      }
    }
  }

  async getJavaRuntimeCommand(id: string) {
    const java = this.getJava(id);
    if (!java) throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_NOT_FOUND"));
    if (java.info.downloading) throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_IS_DOWNLOADING"));
    if (java.info.error) throw new Error(java.info.error);
    const executable = await findJavaExecutable(java.info.path || java.path);
    if (!executable) throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_PATH_NOT_FOUND"));
    return javaExecutableCommand(executable);
  }

  async removeJava(id: string) {
    const java = this.getJava(id);
    if (!java) throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_NOT_FOUND"));
    if (java.info.downloading || this.jobs.has(id))
      throw new Error(this.dependencies.translate("TXT_CODE_COMMON_THIS_JAVA_IS_STILL_BEING_DOWNLOADED"));
    if (java.usingInstances.length)
      throw new Error(this.dependencies.translate("TXT_CODE_COMMON_JAVA_IS_CURRENTLY_RUNNING"));
    await fs.remove(java.path);
    this.javaList.delete(id);
    return true;
  }

  async dispose() {
    this.disposed = true;
    this.source.dispose();
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled([...this.jobs.values()].map((job) => job.done));
  }
}
