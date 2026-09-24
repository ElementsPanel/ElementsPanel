import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { createInstallCommandClass } from "./install_command";
import { createQuickInstallTaskClass } from "./quick_install";

// Daemon side of the app market. It owns both ways a package reaches an
// instance: `quick_install` builds a brand-new instance around a package, and
// the `install` preset reinstalls an existing one. The daemon core keeps
// neither, so a daemon without this plugin simply cannot install packages.

export const inject = ["i18n", "instances", "tasks", "presets"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const QuickInstallTask = createQuickInstallTaskClass(ctx);
  const MarketInstallCommand = createInstallCommandClass(ctx, QuickInstallTask);
  const ADMIN_ROLE = 10;

  ctx.presets.register("install", () => new MarketInstallCommand());

  ctx.tasks.register("quick_install", {
    type: QuickInstallTask.TYPE,
    // The instance does not exist yet: the task creates it around the package.
    requiresInstance: false,
    requiredRole: ADMIN_ROLE,
    create: (_instance, parameter) => {
      const newInstanceName = String(parameter?.newInstanceName ?? "");
      const targetLink = String(parameter?.targetLink ?? "");
      if (!newInstanceName) throw new Error("Instance name is empty!");
      ctx.logger.info(`Quick install: Name: ${newInstanceName} | Download: ${targetLink}`);
      return new QuickInstallTask(newInstanceName, targetLink, parameter?.setupInfo);
    }
  });
}
