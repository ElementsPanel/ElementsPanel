import fs from "fs-extra";
import type { DaemonPluginContext } from "../../../../src/plugin";

/** Market package configuration and legacy reinstall behavior. */
export function createQuickInstallTaskClass(ctx: DaemonPluginContext) {
  const { InstallTask, fileManager } = ctx.instances;
  const $t = ctx.i18n.$t;

  return class QuickInstallTask extends InstallTask {
    public static TYPE = "QuickInstallTask";

    async onStart() {
      if (
        this.instance.config.processType === "docker" &&
        this.buildParams?.processType !== "docker"
      ) {
        this.instance.println("ERROR", $t("TXT_CODE_f8145844"));
        await this.stop();
        return;
      }
      await super.onStart();
    }

    protected async installationConfig() {
      const files = fileManager(this.instance.instanceUuid);
      const bundledConfig = "mcsmanager-config.json";
      ctx.logger.info($t("TXT_CODE_e5ba712d"), this.instance.config.nickname);
      if (this.buildParams?.startCommand || !fs.existsSync(files.toAbsolutePath(bundledConfig)))
        return this.buildParams || {};
      return JSON.parse(await files.readFile(bundledConfig));
    }

    protected updateFailed(error: Error) {
      // Market templates historically report update failures in the console
      // while leaving the installed package available for manual configuration.
      this.instance.println(
        "ERROR",
        `\n========================================
${$t("TXT_CODE_47d56d0d")}
${error.message}
========================================\n`
      );
    }
  };
}

export type QuickInstallTaskClass = ReturnType<typeof createQuickInstallTaskClass>;
export type QuickInstallTask = InstanceType<QuickInstallTaskClass>;
