import type { DaemonPluginContext } from "../../../../src/service/plugins";
import { localeMessages } from "../i18n";
import { createInstallCommandClass } from "./install_command";
import { createQuickInstallTaskClass } from "./quick_install";

// Daemon side of the app market. It owns both ways a package reaches an
// instance: `quick_install` builds a brand-new instance around a package, and
// the `install` preset reinstalls an existing one. The daemon core keeps
// neither, so a daemon without this plugin simply cannot install packages.

export function setup(context: DaemonPluginContext) {
  context.registerLocaleMessages(localeMessages);

  const QuickInstallTask = createQuickInstallTaskClass(context);
  const MarketInstallCommand = createInstallCommandClass(context, QuickInstallTask);
  const ADMIN_ROLE = 10;

  context.registerPresetCommand("install", () => new MarketInstallCommand());

  context.registerAsyncTask("quick_install", {
    type: QuickInstallTask.TYPE,
    // The instance does not exist yet: the task creates it around the package.
    requiresInstance: false,
    requiredRole: ADMIN_ROLE,
    create: (_instance, parameter) => {
      const newInstanceName = String(parameter?.newInstanceName ?? "");
      const targetLink = String(parameter?.targetLink ?? "");
      if (!newInstanceName) throw new Error("Instance name is empty!");
      context.logger.info(`Quick install: Name: ${newInstanceName} | Download: ${targetLink}`);
      return new QuickInstallTask(newInstanceName, targetLink, parameter?.setupInfo);
    }
  });
}
