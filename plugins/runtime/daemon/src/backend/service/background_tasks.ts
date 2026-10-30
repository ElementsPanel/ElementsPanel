import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import EventEmitter from "events";

export interface BackgroundTask {
  id: string;
  owner: string;
  instanceUuid: string;
  kind: string;
  name: string;
  state: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  updatedAt: number;
  current: number;
  total: number;
  error?: string;
}

interface Entry {
  task: BackgroundTask;
  pending: number;
  progress?: () => { current: number; total: number; cancellable?: boolean };
  cancel?: () => unknown;
}

const EVENTS: Record<string, string> = {
  "file/download_from_url": "download",
  "file/upload": "upload",
  "file/upload_extract": "uploadExtract",
  "file/compress": "archive",
  "file/copy": "copy",
  "file/move": "move",
  "file/delete": "delete",
  "file/chmod_batch": "permissions",
  "file/chmod": "permissions",
  "file/preview": "preview",
  "instance/mods/install": "modDownload",
  "instance/mods/install_task": "modDownload",
  "java_manager/download": "javaInstall",
  "java_manager/add": "javaInstall",
  "environment/new_image": "imagePull",
  "instance/backup/restore": "restore",
  "instance/asynchronous": "instanceTask"
};

/** Task lifetime follows the work, including promises detached from a response. */
export class BackgroundTasks extends EventEmitter {
  private readonly scope = new AsyncLocalStorage<Entry>();
  private readonly entries = new Map<string, Entry>();
  /** Owners whose snapshot must be sent; running owners stay until they finish. */
  private readonly pendingOwners = new Set<string>();
  private flushTimer?: NodeJS.Timeout;
  private tickTimer?: NodeJS.Timeout;

  /** Stops the push timers and drops the task table as the runtime plugin unloads. */
  dispose() {
    clearTimeout(this.flushTimer);
    clearInterval(this.tickTimer);
    this.flushTimer = undefined;
    this.tickTimer = undefined;
    this.pendingOwners.clear();
    this.entries.clear();
    this.removeAllListeners();
  }

  /**
   * Coalesces lifecycle changes into one snapshot per owner. A short timer makes
   * starts and stops visible immediately, while the one-second tick below drives
   * progress updates for work that is still running.
   */
  private mark(owner: string) {
    if (!owner) return;
    this.pendingOwners.add(owner);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, 50);
    this.flushTimer.unref();
  }

  /** Emits one snapshot per dirty owner and keeps running owners on the tick. */
  private flush() {
    // The tick and a pending lifecycle flush can coincide; the first one wins.
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const owners = [...this.pendingOwners];
    this.pendingOwners.clear();
    for (const owner of owners) {
      const tasks = this.list(owner);
      this.emit("changed", { owner, tasks });
      if (tasks.some((task) => task.state === "running")) this.pendingOwners.add(owner);
    }
    if (this.pendingOwners.size === 0) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
      return;
    }
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this.flush(), 1000);
      this.tickTimer.unref();
    }
  }

  runRequest<T>(event: string, data: any, work: () => T): T {
    const owner = data?._taskOwner;
    const kind = EVENTS[event];
    if (typeof owner !== "string" || !owner || !kind) return work();
    this.prune();
    const now = Date.now();
    const entry: Entry = {
      task: {
        id: randomUUID(),
        owner,
        kind: kind === "archive" ? (data.type === 1 ? "compress" : "extract") : kind,
        instanceUuid: String(data.instanceUuid || ""),
        name: String(
          data.fileName ||
            data.source ||
            data.name ||
            data.image ||
            data.version ||
            data.backupName ||
            data.taskName ||
            ""
        ),
        state: "running",
        startedAt: now,
        updatedAt: now,
        current: 0,
        total: 0
      },
      pending: 0
    };
    this.entries.set(entry.task.id, entry);
    this.mark(owner);
    return this.scope.run(entry, () => {
      try {
        const result = work();
        this.follow(Promise.resolve(result));
        return result;
      } catch (error) {
        this.fail(error);
        this.finish(entry);
        throw error;
      }
    });
  }

  follow<T>(work: Promise<T>): Promise<T> {
    const entry = this.scope.getStore();
    if (!entry) return work;
    entry.pending++;
    // Observe without replacing the promise or swallowing the caller's error.
    work.then(
      () => {
        entry.pending--;
        this.finish(entry);
      },
      (error) => {
        this.failEntry(entry, error);
        entry.pending--;
        this.finish(entry);
      }
    );
    return work;
  }

  progress(read: Entry["progress"], cancel?: Entry["cancel"]) {
    const entry = this.scope.getStore();
    if (entry) {
      entry.progress = read;
      entry.cancel = cancel;
      this.mark(entry.task.owner);
    }
  }

  fail(error: unknown) {
    const entry = this.scope.getStore();
    if (entry) this.failEntry(entry, error);
  }

  list(owner: string) {
    this.prune();
    return [...this.entries.values()]
      .filter((entry) => entry.task.owner === owner)
      .map((entry) => {
        const progress = entry.progress?.();
        const { owner: _owner, ...task } = entry.task;
        return {
          ...task,
          ...progress,
          cancellable: task.state === "running" && !!entry.cancel && progress?.cancellable !== false
        };
      });
  }

  cancel(owner: string, id: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.task.owner !== owner || entry.task.state !== "running" || !entry.cancel)
      return false;
    if (entry.progress?.().cancellable === false) return false;
    if (entry.cancel() === false) return false;
    entry.task.state = "cancelled";
    entry.task.updatedAt = Date.now();
    this.mark(owner);
    return true;
  }

  clear(owner: string) {
    let removed = false;
    for (const [id, entry] of this.entries) {
      if (entry.task.owner === owner && entry.pending === 0) {
        this.entries.delete(id);
        removed = true;
      }
    }
    if (removed) this.mark(owner);
  }

  private failEntry(entry: Entry, error: any) {
    if (entry.task.state === "cancelled") return;
    entry.task.state =
      error?.code === "ABORT_ERR" || error?.code === "ERR_CANCELED" ? "cancelled" : "failed";
    entry.task.error = error?.message || String(error);
    entry.task.updatedAt = Date.now();
    this.mark(entry.task.owner);
  }

  private finish(entry: Entry) {
    if (entry.pending > 0) return;
    if (entry.task.state === "running") entry.task.state = "completed";
    entry.task.updatedAt = Date.now();
    entry.cancel = undefined;
    this.mark(entry.task.owner);
  }

  private prune() {
    const completed = [...this.entries.values()].filter((entry) => entry.pending === 0);
    for (const entry of completed) {
      if (entry.task.updatedAt < Date.now() - 30 * 60_000 || this.entries.size > 500) {
        this.entries.delete(entry.task.id);
      }
    }
  }
}
