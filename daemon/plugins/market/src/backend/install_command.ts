import fs from "fs-extra";
type InstanceEntity = any;
import type { DaemonPluginContext } from "../../../../src/plugin";
import type { QuickInstallTask, QuickInstallTaskClass } from "./quick_install";

/**
 * The `install` instance preset: wipe the instance directory and reinstall it
 * from a market package. The daemon core has no implementation of its own — the
 * preset exists only while this plugin is loaded.
 */
export function createInstallCommandClass(
  ctx: DaemonPluginContext,
  QuickInstallTask: QuickInstallTaskClass
) {
  const { Command: InstanceCommand, Instance } = ctx.instances;
  const $t = ctx.i18n.$t;

  return class MarketInstallCommand extends InstanceCommand {
    private installTask?: QuickInstallTask;

    constructor() {
      super("MarketInstallCommand");
    }

    private stopped(instance: InstanceEntity) {
      instance.asynchronousTask = undefined;
      instance.setLock(false);
      instance.status(Instance.STATUS_STOP);
    }

    async exec(instance: InstanceEntity, params?: IQuickStartPackages) {
      if (instance.status() !== Instance.STATUS_STOP)
        return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_notStop")));
      if (instance.asynchronousTask)
        return instance.failure(new Error($t("TXT_CODE_general_update.statusErr_otherProgress")));
      if (!params) throw new Error("MarketInstallCommand: No params");
      try {
        instance.setLock(true);
        instance.status(Instance.STATUS_BUSY);
        instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_cbc235ad"));
        if (instance.hasCwdPath()) {
          await fs.remove(instance.absoluteCwdPath());
          await fs.mkdirs(instance.absoluteCwdPath());
        }
        instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_906c5d6a"));

        if (params.dockerOptional && instance.config.processType === "docker") {
          params.setupInfo.docker = {
            ...params.setupInfo.docker,
            ...params.dockerOptional
          };
          params.setupInfo.processType = "docker";
        }

        // "params" was already matched against the catalogue by the panel's
        // POST /api/market/install_instance, so no caller-supplied start
        // command can reach this point.
        this.installTask = new QuickInstallTask(
          instance.config.nickname,
          params.targetLink,
          params.setupInfo,
          instance
        );

        instance.asynchronousTask = this;
        instance.println($t("TXT_CODE_1704ea49"), $t("TXT_CODE_b9ca022b"));
        await this.installTask?.start();
        await this.installTask?.wait();
      } catch (err: any) {
        instance.println(
          $t("TXT_CODE_general_update.update"),
          $t("TXT_CODE_general_update.error", { err })
        );
      } finally {
        this.stopped(instance);
      }
    }

    async stop(instance: InstanceEntity): Promise<void> {
      instance.println(
        $t("TXT_CODE_general_update.update"),
        $t("TXT_CODE_general_update.killProcess")
      );
      this.stopped(instance);
      await this.installTask?.stop();
      this.installTask = undefined;
    }
  };
}
