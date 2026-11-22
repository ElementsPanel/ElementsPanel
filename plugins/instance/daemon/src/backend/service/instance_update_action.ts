import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import iconv from "iconv-lite";
import { killProcess } from "mcsmanager-common";
import { commandStringToArray } from "../entity/commands/base/command_parser";
import Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import { AsyncTask, IAsyncTaskJSON } from "./async_task_service";
import logger from "./log";
import { SetupDockerContainer } from "./docker_process_service";

export class InstanceUpdateAction extends AsyncTask {
  public pid?: number;

  private process?: ChildProcessWithoutNullStreams;
  private containerWrapper?: SetupDockerContainer;

  constructor(public readonly instance: Instance) {
    super();
  }

  public async onStart() {
    const updateCommand = await this.instance.parseTextParams(this.instance.config.updateCommand);
    logger.info(
      $t("TXT_CODE_GENERAL_UPDATE_READY_UPDATE", { instanceUuid: this.instance.instanceUuid })
    );
    logger.info(
      $t("TXT_CODE_GENERAL_UPDATE_UPDATE_CMD", { instanceUuid: this.instance.instanceUuid })
    );
    logger.info(updateCommand);

    this.instance.print("\n");
    this.instance.println(
      $t("TXT_CODE_GENERAL_UPDATE_UPDATE"),
      $t("TXT_CODE_GENERAL_UPDATE_READY_UPDATE", { instanceUuid: this.instance.instanceUuid })
    );
    this.instance.println($t("TXT_CODE_GENERAL_UPDATE_UPDATE"), `${updateCommand}`);

    // Prefer updateCommandImage; otherwise reuse the configured container image.
    const updateImage =
      this.instance.config.docker?.updateCommandImage?.trim() ||
      (this.instance.config.processType === "docker" && this.instance.config.docker?.image
        ? this.instance.config.docker.image
        : "");
    if (updateImage) {
      const imageOverride = this.instance.config.docker?.updateCommandImage?.trim() || undefined;
      this.containerWrapper = new SetupDockerContainer(this.instance, updateCommand, imageOverride);
      await this.containerWrapper.start();
      await this.containerWrapper.attach(this.instance);
      await this.containerWrapper.wait();
      this.stop();
      return;
    }

    const commandList = commandStringToArray(updateCommand);
    const commandExeFile = commandList[0];
    const commandParameters = commandList.slice(1);
    if (commandList.length === 0) {
      throw new Error($t("TXT_CODE_GENERAL_UPDATE_CMD_FORMAT_ERR"));
    }

    const process = spawn(commandExeFile, commandParameters, {
      cwd: this.instance.absoluteCwdPath(),
      stdio: "pipe",
      windowsHide: true
    });
    process.once("error", (error) => {
      void this.error(error);
    });

    this.pid = process.pid;
    this.process = process;

    process.stdout.on("data", (text) => {
      this.instance.print(iconv.decode(text, this.instance.config.oe));
    });
    process.stderr.on("data", (text) => {
      this.instance.print(iconv.decode(text, this.instance.config.oe));
    });

    process.on("exit", (code) => {
      if (code === 0) {
        this.stop();
      } else {
        this.error(new Error($t("TXT_CODE_GENERAL_UPDATE_UPDATE_ERR")));
      }
    });
  }

  public async onStop() {
    if (this.containerWrapper) {
      await this.containerWrapper.stop();
    }
    if (this.pid && this.process) {
      killProcess(this.pid, this.process);
    }
  }

  public async onError(_err: Error) {}
  public toObject(): IAsyncTaskJSON {
    throw new Error("Method not implemented.");
  }
}
