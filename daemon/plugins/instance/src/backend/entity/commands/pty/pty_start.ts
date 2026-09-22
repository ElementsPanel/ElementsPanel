import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { Writable } from "stream";
import { v4 } from "uuid";
import { PTY_PATH } from "../../../const";
import { $t } from "../../../i18n";
import logger from "../../../service/log";
import { getRunAsUserParams } from "../../../tools/system_user";
import Instance from "../../instance/instance";
import { commandStringToArray } from "../base/command_parser";
import { ChildProcessAdapter, waitForSpawn } from "../base/process_adapter";
import FunctionDispatcher from "../dispatcher";
import GeneralStartCommand from "../general/general_start";
import AbsStartCommand from "../start";

interface IPtySubProcessCfg {
  pid: number;
}

// Error exception at startup
class StartupError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

const GO_PTY_MSG_TYPE = {
  RESIZE: 0x04
};

// process adapter
export class GoPtyProcessAdapter extends ChildProcessAdapter {
  private pipeClient?: Writable;
  private pipeTimer?: NodeJS.Timeout;
  private pipeOpening?: Promise<void>;
  private cleanup?: Promise<void>;

  constructor(
    process: ChildProcess,
    pid: number | undefined,
    public readonly pipeName: string
  ) {
    super(process, false);
    this.pid = pid ?? process.pid;
  }

  public attachOutput() {
    super.attachOutput();
    if (this.disposed || this.pipeTimer || this.pipeOpening) return;
    this.pipeTimer = setTimeout(() => {
      this.pipeTimer = undefined;
      this.pipeOpening = this.initNamedPipe();
    }, 1000);
  }

  private async initNamedPipe() {
    if (this.disposed) return;
    try {
      const flags = os.platform() === "win32" ? "w" : fs.constants.O_WRONLY | fs.constants.O_NONBLOCK;
      const fd = await fs.open(this.pipeName, flags);
      if (this.disposed) {
        await fs.close(fd);
        return;
      }
      const writePipe = fs.createWriteStream("", { fd });
      writePipe.on("error", (err) => {
        logger.error("Pipe error:", this.pipeName, err);
      });
      this.pipeClient = writePipe;
    } catch (error) {
      logger.warn("Start PTY Pipe error, This maybe is not a bug:", this.pipeName, error);
    }
  }

  public resize(w: number, h: number) {
    const MAX_W = 900;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    w = Math.min(MAX_W, Math.floor(w));
    h = Math.min(MAX_W, Math.floor(h));
    const resizeStruct = JSON.stringify({ width: Number(w), height: Number(h) });
    const len = resizeStruct.length;
    const lenBuff = Buffer.alloc(2);
    lenBuff.writeInt16BE(len, 0);
    const buf = Buffer.from([GO_PTY_MSG_TYPE.RESIZE, ...lenBuff, ...Buffer.from(resizeStruct)]);
    this.writeToNamedPipe(buf);
  }

  public writeToNamedPipe(data: Buffer) {
    if (!this.disposed) this.pipeClient?.write(data);
  }

  public destroy(): Promise<void> {
    if (this.cleanup) return this.cleanup;
    clearTimeout(this.pipeTimer);
    this.pipeTimer = undefined;
    // Mark disposed before awaiting an in-flight open, which closes a late fd.
    let destroyed: void | Promise<void>;
    try {
      destroyed = super.destroy();
    } catch (error) {
      destroyed = Promise.reject(error);
    }
    this.cleanup = Promise.resolve(destroyed).finally(async () => {
      await this.pipeOpening;
      this.pipeClient?.destroy();
      this.pipeClient = undefined;
      if (os.platform() !== "win32") await fs.remove(this.pipeName);
    });
    return this.cleanup;
  }
}

export default class PtyStartCommand extends AbsStartCommand {
  readPtySubProcessConfig(subProcess: ChildProcessWithoutNullStreams): Promise<IPtySubProcessCfg> {
    return new Promise((resolve, reject) => {
      let header = Buffer.alloc(0);
      const cleanup = () => {
        clearTimeout(timer);
        subProcess.stdout.off("data", onData);
        subProcess.stdout.off("error", onError);
        subProcess.off("error", onError);
        subProcess.off("exit", onExit);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onExit = () => onError(new StartupError($t("TXT_CODE_pty_start.instanceStartErr")));
      const onData = (chunk: Buffer) => {
        try {
          header = Buffer.concat([header, chunk]);
          const end = header.indexOf(10);
          if (end < 0 && header.length <= 65536) return;
          if (end < 0 || end > 65536) throw new Error("Invalid PTY startup response");
          const cfg = JSON.parse(header.subarray(0, end).toString("utf8")) as IPtySubProcessCfg;
          if (!Number.isSafeInteger(cfg.pid) || cfg.pid <= 0)
            throw new Error("Invalid PTY process ID");
          // Preserve output arriving in the same chunk as the handshake.
          subProcess.stdout.pause();
          cleanup();
          const remaining = header.subarray(end + 1);
          if (remaining.length) subProcess.stdout.unshift(remaining);
          resolve(cfg);
        } catch (error: any) {
          onError(error);
        }
      };
      const timer = setTimeout(onExit, 3000);
      subProcess.once("error", onError);
      subProcess.once("exit", onExit);
      subProcess.stdout.once("error", onError);
      subProcess.stdout.on("data", onData);
    });
  }

  async createProcess(instance: Instance) {
    if (!instance.config.ie || !instance.config.oe) {
      instance.config.ie = "utf-8";
      instance.config.oe = "utf-8";
    }
    if (!instance.config.startCommand || !instance.hasCwdPath())
      throw new StartupError($t("TXT_CODE_pty_start.cmdErr"));
    if (!fs.existsSync(instance.absoluteCwdPath())) fs.mkdirpSync(instance.absoluteCwdPath());
    if (!path.isAbsolute(path.normalize(instance.absoluteCwdPath())))
      throw new StartupError($t("TXT_CODE_pty_start.mustAbsolutePath"));

    // PTY mode correctness check
    logger.info($t("TXT_CODE_pty_start.startPty", { source: "" }));
    let checkPtyEnv = true;

    if (!fs.existsSync(PTY_PATH)) {
      instance.println("ERROR", $t("TXT_CODE_pty_start.startErr"));
      checkPtyEnv = false;
    }

    if (checkPtyEnv === false) {
      instance.config.terminalOption.pty = false;
      await instance.forceExec(new FunctionDispatcher());
      // The outer start command already owns the lock and STARTING state.
      await new GeneralStartCommand().createProcess(instance);
      return;
    }

    // command parsing
    let commandList: string[] = [];
    const tmpStarCmd = await instance.parseTextParams(instance.config.startCommand);
    if (os.platform() === "win32") {
      // windows: cmd.exe /c {{startCommand}}
      commandList = [tmpStarCmd];
    } else {
      // other
      commandList = commandStringToArray(tmpStarCmd);
    }

    if (commandList.length === 0)
      return instance.failure(new StartupError($t("TXT_CODE_pty_start.cmdEmpty")));

    const pipeId = v4();
    const pipeLinuxDir = "/tmp/mcsmanager-instance-pipe";
    if (!fs.existsSync(pipeLinuxDir)) fs.mkdirsSync(pipeLinuxDir);
    let pipeName = `${pipeLinuxDir}/pipe-${pipeId}`;
    if (os.platform() === "win32") {
      pipeName = `\\\\.\\pipe\\mcsmanager-${pipeId}`;
    }

    const runAsConfig = await getRunAsUserParams(instance);

    // Prepare PTY parameters
    const ptyParameter = [
      "-size",
      `${instance.config.terminalOption.ptyWindowCol},${instance.config.terminalOption.ptyWindowRow}`,
      "-coder",
      instance.config.oe,
      "-dir",
      instance.absoluteCwdPath(),
      "-fifo",
      pipeName,
      "-cmd",
      JSON.stringify(commandList)
    ];

    logger.info("----------------");
    logger.info($t("TXT_CODE_pty_start.sourceRequest", { source: "" }));
    logger.info($t("TXT_CODE_pty_start.instanceUuid", { instanceUuid: instance.instanceUuid }));
    logger.info($t("TXT_CODE_pty_start.startCmd", { cmd: commandList.join(" ") }));
    logger.info($t("TXT_CODE_pty_start.ptyPath", { path: PTY_PATH }));
    logger.info($t("TXT_CODE_pty_start.ptyParams", { param: ptyParameter.join(" ") }));
    logger.info($t("TXT_CODE_pty_start.ptyCwd", { cwd: instance.absoluteCwdPath() }));
    logger.info($t("TXT_CODE_general_start.runAs", { user: runAsConfig.runAsName }));
    logger.info("----------------");

    if (runAsConfig.isEnableRunAs) {
      instance.println("INFO", $t("TXT_CODE_ba09da46", { name: runAsConfig.runAsName }));
    }

    instance.println("INFO", "> " + commandList.join(" "));

    // create pty child process
    const subProcess = spawn(PTY_PATH, ptyParameter, {
      ...runAsConfig,
      cwd: path.dirname(PTY_PATH),
      stdio: "pipe",
      windowsHide: true,
      env: instance.generateEnv(),
      // Do not detach the child process;
      // otherwise, an abnormal exit of the parent process may cause the child process to continue running,
      // leading to an abnormal instance state.
      detached: false
    });

    const processAdapter = new GoPtyProcessAdapter(subProcess, subProcess.pid, pipeName);
    try {
      const [, config] = await Promise.all([
        waitForSpawn(subProcess),
        this.readPtySubProcessConfig(subProcess)
      ]);
      processAdapter.pid = config.pid;
      if (subProcess.exitCode !== null || subProcess.signalCode !== null)
        throw new StartupError($t("TXT_CODE_pty_start.instanceStartErr"));
      instance.started(processAdapter);
      processAdapter.attachOutput();
    } catch (error) {
      await processAdapter.destroy();
      instance.println(
        "ERROR",
        $t("TXT_CODE_pty_start.pidErr", {
          startCommand: commandList.join(" "),
          path: PTY_PATH,
          params: JSON.stringify(ptyParameter)
        })
      );
      throw error;
    }

    logger.info(
      $t("TXT_CODE_pty_start.startSuccess", {
        instanceUuid: instance.instanceUuid,
        pid: processAdapter.pid
      })
    );
    instance.println("INFO", $t("TXT_CODE_b50ffba8"));
  }
}
