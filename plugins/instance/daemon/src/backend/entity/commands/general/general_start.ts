import { spawn } from "child_process";
import fs from "fs-extra";
import { $t } from "../../../i18n";
import logger from "../../../service/log";
import { getRunAsUserParams } from "../../../tools/system_user";
import Instance from "../../instance/instance";
import { commandStringToArray } from "../base/command_parser";
import { ChildProcessAdapter, spawnInstanceProcess, waitForSpawn } from "../base/process_adapter";
import AbsStartCommand from "../start";

class StartupError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export default class GeneralStartCommand extends AbsStartCommand {
  async createProcess(instance: Instance, source = "") {
    if (!instance.config.ie || !instance.config.oe) {
      instance.config.ie = "utf-8";
      instance.config.oe = "utf-8";
    }
    if (
      (!instance.config.startCommand && instance.config.processType === "general") ||
      !instance.hasCwdPath()
    )
      throw new StartupError($t("TXT_CODE_GENERAL_START_INSTANCE_CONFIG_ERR"));
    if (!fs.existsSync(instance.absoluteCwdPath())) fs.mkdirpSync(instance.absoluteCwdPath());

    const tmpStartCmd = await instance.parseTextParams(instance.config.startCommand);
    const commandList = commandStringToArray(tmpStartCmd);
    const commandExeFile = commandList[0];
    const commandParameters = commandList.slice(1);
    if (commandList.length === 0) {
      throw new StartupError($t("TXT_CODE_GENERAL_START_CMD_EMPTY"));
    }

    const runAsConfig = await getRunAsUserParams(instance);

    logger.info("----------------");
    logger.info($t("TXT_CODE_GENERAL_START_START_INSTANCE", { source: source }));
    logger.info($t("TXT_CODE_GENERAL_START_INSTANCE_UUID", { uuid: instance.instanceUuid }));
    logger.info($t("TXT_CODE_GENERAL_START_START_CMD", { cmdList: JSON.stringify(commandList) }));
    logger.info($t("TXT_CODE_GENERAL_START_CWD", { cwd: instance.absoluteCwdPath() }));
    logger.info($t("TXT_CODE_GENERAL_START_RUN_AS", { user: runAsConfig.runAsName }));
    logger.info("----------------");

    if (runAsConfig.isEnableRunAs) {
      instance.println(
        "INFO",
        $t("TXT_CODE_COMMON_TRYING_TO_START_CHILD_PROCESS_AS_LINUX_USER", {
          name: runAsConfig.runAsName
        })
      );
    }

    const subProcess = spawnInstanceProcess(instance, spawn, commandExeFile, commandParameters, {
      ...runAsConfig,
      cwd: instance.absoluteCwdPath(),
      stdio: "pipe",
      windowsHide: true,
      env: instance.generateEnv(),
      detached: false
    });

    const processAdapter = new ChildProcessAdapter(subProcess);
    try {
      await waitForSpawn(subProcess);
      processAdapter.pid = subProcess.pid;
      subProcess.setMetadata?.({ pid: subProcess.pid });
      instance.started(processAdapter);
    } catch (error) {
      await processAdapter.destroy();
      instance.println(
        "ERROR",
        $t("TXT_CODE_GENERAL_START_PID_ERR", {
          startCommand: instance.config.startCommand,
          commandExeFile: commandExeFile,
          commandParameters: JSON.stringify(commandParameters)
        })
      );
      throw error;
    }
    logger.info(
      $t("TXT_CODE_GENERAL_START_START_SUCCESS", {
        instanceUuid: instance.instanceUuid,
        pid: subProcess.pid
      })
    );
    instance.println("INFO", $t("TXT_CODE_GENERAL_START_START_ORDINARY_TERMINAL"));
    instance.println("INFO", $t("TXT_CODE_COMMON_THE_INSTANCE_HAS_BEEN_STARTED"));
  }
}
