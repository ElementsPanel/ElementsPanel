import { ChildProcess, execFileSync, SpawnOptionsWithoutStdio } from "child_process";
import os from "os";
import child_process from "child_process";
import path from "path";
import EventEmitter from "events";
import iconv from "iconv-lite";
import nodeProcess from "process";

export class StartError extends Error {}

export class ProcessWrapper extends EventEmitter {
  public process?: ChildProcess;
  public pid?: number;
  private lastExitCode?: number | null;
  private completed = false;

  public errMsg = {
    timeoutErr: "task timeout!",
    exitErr: "task error!",
    startErr: "task start error!"
  };

  constructor(
    public readonly file: string,
    public readonly args: string[],
    public readonly cwd: string,
    public readonly timeout: number = 0,
    public readonly code = "utf-8",
    public readonly option: SpawnOptionsWithoutStdio = {}
  ) {
    super();
  }

  public setErrMsg(errMsg: { timeoutErr: string; exitErr: string; startErr: string }) {
    this.errMsg = errMsg;
  }

  public start(): Promise<boolean> {
    if (this.process) return Promise.reject(new Error("The process is already running"));
    return new Promise((resolve, reject) => {
      const stdoutDecoder = iconv.decodeStream(this.code);
      const stderrDecoder = iconv.decodeStream(this.code);
      let timeTask: NodeJS.Timeout | undefined;
      let settled = false;
      let spawned = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timeTask) clearTimeout(timeTask);
        if (error) reject(error);
        else resolve(true);
      };
      const subProcess = child_process.spawn(this.file, this.args, {
        stdio: "pipe",
        windowsHide: true,
        cwd: path.normalize(this.cwd),
        ...this.option
      });
      this.process = subProcess;
      this.pid = subProcess.pid;
      this.lastExitCode = undefined;
      this.completed = false;

      const fail = (error: Error) => {
        if (settled) return;
        settle(error);
        if (subProcess.pid && subProcess.exitCode === null && subProcess.signalCode === null) {
          try {
            killProcess(subProcess.pid, subProcess);
          } catch (error) {
            console.error("[ProcessWrapper kill error]", error);
          }
        }
      };

      subProcess.once("spawn", () => {
        spawned = true;
        this.emit("start", subProcess.pid);
      });
      for (const [source, decoder] of [
        [subProcess.stdout, stdoutDecoder],
        [subProcess.stderr, stderrDecoder]
      ] as const) {
        decoder.on("data", (text) => this.emit("data", text));
        decoder.on("error", fail);
        source.on("error", fail);
        source.pipe(decoder);
      }
      subProcess.stdin.on("error", fail);
      subProcess.once("error", (error) => {
        fail(new Error(`${spawned ? this.errMsg.exitErr : this.errMsg.startErr} ${error.message}`));
      });
      subProcess.once("exit", (code) => {
        this.lastExitCode = code;
        this.emit("exit", code);
      });
      // `close` follows the final stdout/stderr data and also follows a failed spawn.
      subProcess.once("close", (code) => {
        this.lastExitCode = code;
        this.completed = true;
        this.process = undefined;
        settle(code === 0 ? undefined : new Error(this.errMsg.exitErr));
      });

      if (this.timeout > 0) {
        timeTask = setTimeout(() => {
          fail(new Error(this.errMsg.timeoutErr));
        }, 1000 * this.timeout);
      }
    });
  }

  public getPid() {
    return this.process?.pid;
  }

  public write(data?: any) {
    return this.process?.stdin?.write(iconv.encode(data, this.code));
  }

  public kill() {
    if (this.process?.pid) killProcess(this.process?.pid, this.process);
  }

  public status() {
    return this.completed;
  }

  public exitCode() {
    return this.process?.exitCode ?? this.lastExitCode;
  }
}

export function killProcess(
  pid: string | number,
  process: { kill(signal?: any): any },
  signal?: any
) {
  const numericPid = Number(pid);
  if (!Number.isSafeInteger(numericPid) || numericPid <= 0) {
    throw new Error("Invalid process ID");
  }
  try {
    if (os.platform() === "win32") {
      execFileSync("taskkill", ["/PID", String(numericPid), "/T", "/F"], { windowsHide: true });
      return true;
    }
    return nodeProcess.kill(numericPid, signal || "SIGKILL");
  } catch (err) {
    return signal ? process.kill(signal) : process.kill("SIGKILL");
  }
}
