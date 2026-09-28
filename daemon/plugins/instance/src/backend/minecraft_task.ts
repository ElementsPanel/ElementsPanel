import type { DaemonPluginContext } from "../../../../src/plugin";
import type { MinecraftInstallOptions } from "../../../../../common/src/minecraft";
import {
  minecraftFileName,
  minecraftInstallerCommand,
  minecraftStartCommand,
  validateMinecraftInstall
} from "./minecraft_install";

export function createMinecraftInstallTaskClass(ctx: DaemonPluginContext) {
  const { InstallTask } = ctx.instances;
  const $t = ctx.i18n.$t;

  return class MinecraftInstallTask extends InstallTask {
    public static TYPE = "MinecraftInstallTask";

    constructor(
      name: string,
      targetLink: string,
      config: IGlobalInstanceConfig,
      private readonly minecraft: MinecraftInstallOptions
    ) {
      super(name, targetLink, config, undefined, {
        fileName: minecraftFileName(minecraft),
        sha256: minecraft.sha256,
        hashMismatchMessage: $t("TXT_CODE_minecraft.hashMismatch"),
        headers: { "User-Agent": "ElementsPanel" },
        timeout: 30000,
        sourceLabel: `${minecraft.server}/${minecraft.version}`
      });
    }

    protected async installationConfig(): Promise<Partial<IGlobalInstanceConfig>> {
      return { ...this.buildParams, cwd: this.instance.config.cwd, processType: "general" };
    }

    protected async install() {
      if (this.minecraft.kind === "forge" || this.minecraft.kind === "neoforge") {
        const updateCommand = this.instance.config.updateCommand;
        try {
          this.instance.config.updateCommand = minecraftInstallerCommand(this.minecraft);
          await this.runUpdate();
        } finally {
          this.instance.config.updateCommand = updateCommand;
        }
      }
      if (this.cancelled) return;
      const startCommand = await minecraftStartCommand(
        this.instance.absoluteCwdPath(),
        this.minecraft,
        $t
      );
      if (!this.instance.config.startCommand?.trim())
        this.instance.parameters({ startCommand }, true);
    }
  };
}

export const inject = ["i18n", "instances", "tasks", "features"];

export function apply(ctx: DaemonPluginContext) {
  const MinecraftInstallTask = createMinecraftInstallTaskClass(ctx);
  ctx.tasks.register("minecraft_install", {
    type: MinecraftInstallTask.TYPE,
    requiresInstance: false,
    requiredRole: 10,
    create: (_instance, parameter) => {
      const name = String(parameter?.newInstanceName ?? "").trim();
      if (!name) throw new Error("Instance name is empty!");
      const targetLink = String(parameter?.targetLink ?? "");
      const options = validateMinecraftInstall(parameter?.minecraft, targetLink, ctx.i18n.$t);
      return new MinecraftInstallTask(name, targetLink, parameter?.setupInfo, options);
    }
  });
  ctx.features.add("minecraftInstall");
}
