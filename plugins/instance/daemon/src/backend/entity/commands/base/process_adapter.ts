import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { killProcess } from "mcsmanager-common";
import type { IInstanceProcess } from "../../instance/interface";

/** spawn() reports failures asynchronously, including a missing executable. */
export function waitForSpawn(process: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.off("spawn", onSpawn);
      process.off("error", onError);
    };
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    process.once("spawn", onSpawn);
    process.once("error", onError);
  });
}

/** Owns only the listeners and streams installed for one instance process. */
export class ChildProcessAdapter extends EventEmitter implements IInstanceProcess {
  public pid?: number | string;
  protected disposed = false;
  private outputAttached = false;
  private closed = false;

  private readonly onData = (data: Buffer) => this.emit("data", data);
  private readonly onExit = (code: number | null) => this.emit("exit", code ?? 0);
  private readonly onError = (error: Error) => {
    // Startup has its own rejecting promise. Later errors belong to the instance.
    if (this.listenerCount("error")) this.emit("error", error);
  };

  constructor(
    protected readonly child: ChildProcess,
    forwardOutput = true
  ) {
    super();
    this.pid = child.pid;
    child.once("close", () => { this.closed = true; });
    // close follows the final stdout/stderr data; exit can arrive before it.
    child.on("close", this.onExit);
    child.on("error", this.onError);
    child.stdin?.on("error", this.onError);
    child.stdout?.on("error", this.onError);
    child.stderr?.on("error", this.onError);
    if (forwardOutput) this.attachOutput();
  }

  public attachOutput() {
    if (this.outputAttached || this.disposed) return;
    this.outputAttached = true;
    this.child.stdout?.on("data", this.onData);
    this.child.stderr?.on("data", this.onData);
    this.child.stdout?.resume();
  }

  public write(data?: string) {
    if (!this.disposed) return this.child.stdin?.write(data);
  }

  public kill(signal?: NodeJS.Signals) {
    if (this.pid) return killProcess(this.pid, this.child, signal);
  }

  public destroy(): void | Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.child.off("close", this.onExit);
    this.child.stdout?.off("data", this.onData);
    this.child.stderr?.off("data", this.onData);
    this.removeAllListeners();

    // Keep the error handlers through close: kill() and closing stdin can still
    // report asynchronous errors after disposal has begun.
    const removeErrorHandlers = () => {
      this.child.off("error", this.onError);
      this.child.stdin?.off("error", this.onError);
      this.child.stdout?.off("error", this.onError);
      this.child.stderr?.off("error", this.onError);
    };
    if (this.closed) {
      removeErrorHandlers();
    } else {
      this.child.once("close", removeErrorHandlers);
    }

    try {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.kill("SIGKILL");
        // A PTY adapter's pid is the game process; its helper also needs to exit.
        if (this.pid !== this.child.pid) this.child.kill("SIGKILL");
      }
    } finally {
      this.child.stdin?.destroy();
      this.child.stdout?.destroy();
      this.child.stderr?.destroy();
    }
  }
}
