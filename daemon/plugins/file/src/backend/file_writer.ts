import fs from "fs-extra";
import path from "path";
import * as lockfile from "proper-lockfile";
import FileManager from "./system_file";
import { logger } from "./runtime";
import uploadManager from "./upload_manager";

type ChunkRange = { start: number; end: number };

export default class FileWriter {
  readonly path: string;
  id?: string;
  private releaseLock?: () => Promise<void>;
  private fd: number | null = null;
  private operations: Promise<void> = Promise.resolve();
  private completed = false;
  readonly received: ChunkRange[] = [];
  lastUpdate: number = Date.now();

  constructor(
    public readonly cwd: string,
    private filename: string,
    public readonly size: number,
    private unzip: boolean,
    private zipCode: string,
    filePath: string
  ) {
    if (!FileManager.checkFileName(path.basename(this.filename)))
      throw new Error("Access denied: Malformed file name");
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid file size");

    this.path = filePath;
  }

  static async getPath(cwd: string, dir: string, filename: string, overwrite: boolean) {
    const fileManager = new FileManager(cwd);

    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);

    let tempFileSaveName = basename + ext;
    let counter = 1;

    const checkFile = async (name: string) => {
      const absolutePath = fileManager.toAbsolutePath(path.normalize(path.join(dir, name)));
      const isLock = await lockfile
        .check(absolutePath)
        .then((isLock) => isLock)
        .catch(() => false);
      const isAccess = await fs
        .access(absolutePath)
        .then(() => true)
        .catch(() => false);
      return isAccess && !isLock && !overwrite;
    };

    while (await checkFile(tempFileSaveName)) {
      if (counter == 1) {
        tempFileSaveName = `${basename}-copy${ext}`;
      } else {
        tempFileSaveName = `${basename}-copy-${counter}${ext}`;
      }
      counter++;
      if (counter > 100) {
        throw new Error("Access denied: File name already exists!");
      }
    }

    const fileSaveRelativePath = path.normalize(path.join(dir, tempFileSaveName));

    if (!fileManager.checkPath(fileSaveRelativePath))
      throw new Error("Access denied: Invalid destination");

    return fileManager.toAbsolutePath(fileSaveRelativePath);
  }

  async init() {
    if (this.fd != null) return;
    try {
      // Lock before opening with w+: a competing upload must not truncate the file.
      this.releaseLock = await lockfile.lock(this.path, { realpath: false });
      this.fd = await fs.open(this.path, "w+");
      await fs.ftruncate(this.fd, this.size);
    } catch (e) {
      try {
        await this.close();
      } finally {
        await this.unlock();
      }
      throw e;
    }
  }

  private enqueue(operation: () => Promise<void>) {
    const pending = this.operations.then(operation);
    this.operations = pending.catch(() => {});
    return pending;
  }

  write(offset: number, chunk: Buffer) {
    return this.enqueue(async () => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + chunk.length > this.size) {
        throw new Error("Write exceeds file size limit");
      }
      if (this.fd === null || this.completed) throw new Error("File is not opened");
      this.lastUpdate = Date.now();
      let written = 0;
      while (written < chunk.length) {
        const { bytesWritten } = await fs.write(
          this.fd,
          chunk,
          written,
          chunk.length - written,
          offset + written
        );
        if (bytesWritten === 0) throw new Error("Unable to write upload chunk");
        written += bytesWritten;
      }
      this.addWrittenRange(offset, offset + chunk.length);
      if (this.isFullyCovered()) await this.finish(false);
    });
  }

  done() {
    return this.enqueue(() => this.finish(false));
  }

  stop() {
    return this.enqueue(() => this.finish(true));
  }

  private async close() {
    const fd = this.fd;
    this.fd = null;
    if (fd != null) await fs.close(fd);
  }

  private async unlock() {
    const releaseLock = this.releaseLock;
    this.releaseLock = undefined;
    await releaseLock?.();
  }

  private async finish(cancelled: boolean) {
    if (this.completed) return;
    this.completed = true;
    try {
      await this.close();
      if (cancelled) {
        await fs.remove(this.path);
        logger().info("Browser Upload Task Stopped:", this.path);
      } else {
        logger().info("Browser Uploaded File:", this.path);
        if (this.unzip) {
          const instanceFiles = new FileManager(this.cwd);
          await instanceFiles.unzip(this.path, ".", this.zipCode);
          logger().info("File unzipped:", this.path);
        }
      }
    } finally {
      try {
        // Keep ownership until removal/extraction completes, so a newer upload
        // cannot start using the same path while this task is still changing it.
        await this.unlock();
      } finally {
        if (this.id != null) uploadManager.delete(this.id);
      }
    }
  }

  private addWrittenRange(start: number, end: number): void {
    if (start >= end) return;

    let i = 0;
    let ranges = this.received;
    while (i < ranges.length && ranges[i].end < start) i++;

    let mergeStart = start,
      mergeEnd = end;
    let removeCount = 0;

    while (i + removeCount < ranges.length && ranges[i + removeCount].start <= mergeEnd) {
      mergeStart = Math.min(mergeStart, ranges[i + removeCount].start);
      mergeEnd = Math.max(mergeEnd, ranges[i + removeCount].end);
      removeCount++;
    }

    ranges.splice(i, removeCount, { start: mergeStart, end: mergeEnd });
  }

  private isFullyCovered(): boolean {
    return (
      this.received.length === 1 &&
      this.received[0].start === 0 &&
      this.received[0].end === this.size
    );
  }
}
