import { spawn } from "child_process";
import fs from "fs-extra";
import { $t } from "../../../i18n";
import logger from "../../../service/log";
import { getRunAsUserParams } from "../../../tools/system_user";
import Instance from "../../instance/instance";
import { commandStringToArray } from "../base/command_parser";
import { ChildProcessAdapter, waitForSpawn } from "../base/process_adapter";
import AbsStartCommand from "../start";

// Error exception at startup
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
      throw new StartupError($t("TXT_CODE_general_start.instanceConfigErr"));
    if (!fs.existsSync(instance.absoluteCwdPath())) fs.mkdirpSync(instance.absoluteCwdPath());

    // command parsing
    const tmpStartCmd = await instance.parseTextParams(instance.config.startCommand);
    const commandList = commandStringToArray(tmpStartCmd);
    const commandExeFile = commandList[0];
    const commandParameters = commandList.slice(1);
    if (commandList.length === 0) {
      throw new StartupError($t("TXT_CODE_general_start.cmdEmpty"));
    }

    const runAsConfig = await getRunAsUserParams(instance);

    logger.info("----------------");
    logger.info($t("TXT_CODE_general_start.startInstance", { source: source }));
    logger.info($t("TXT_CODE_general_start.instanceUuid", { uuid: instance.instanceUuid }));
    logger.info($t("TXT_CODE_general_start.startCmd", { cmdList: JSON.stringify(commandList) }));
    logger.info($t("TXT_CODE_general_start.cwd", { cwd: instance.absoluteCwdPath() }));
    logger.info($t("TXT_CODE_general_start.runAs", { user: runAsConfig.runAsName }));
    logger.info("----------------");

    if (runAsConfig.isEnableRunAs) {
      instance.println("INFO", $t("TXT_CODE_ba09da46", { name: runAsConfig.runAsName }));
    }

    // create child process
    const subProcess = spawn(commandExeFile, commandParameters, {
      ...runAsConfig,
      cwd: instance.absoluteCwdPath(),
      stdio: "pipe",
      windowsHide: true,
      env: instance.generateEnv(),
      // Do not detach the child process;
      // otherwise, an abnormal exit of the parent process may cause the child process to continue running,
      // leading to an abnormal instance state.
      detached: false
    });

    const processAdapter = new ChildProcessAdapter(subProcess);
    try {
      await waitForSpawn(subProcess);
      instance.started(processAdapter);
    } catch (error) {
      await processAdapter.destroy();
      instance.println(
        "ERROR",
        $t("TXT_CODE_general_start.pidErr", {
          startCommand: instance.config.startCommand,
          commandExeFile: commandExeFile,
          commandParameters: JSON.stringify(commandParameters)
        })
      );
      throw error;
    }
    logger.info(
      $t("TXT_CODE_general_start.startSuccess", {
        instanceUuid: instance.instanceUuid,
        pid: subProcess.pid
      })
    );
    instance.println("INFO", $t("TXT_CODE_general_start.startOrdinaryTerminal"));
    instance.println("INFO", $t("TXT_CODE_b50ffba8"));
  }
}
