import type { DaemonPluginContext } from "../../../../../src/plugin";

function refactorInstanceConfig(config: any) {
  if (isNaN(config.passWordType)) config.passWordType = 0;
  if (typeof config.endTime === "string") {
    config.endTime = new Date(config.endTime).getTime();
    return true;
  }
  return false;
}

export function migrateConfig(ctx: DaemonPluginContext) {
  for (const configPath of ctx.storage.readDir("InstanceConfig")) {
    try {
      const config = JSON.parse(ctx.storage.readFile(configPath));
      if (refactorInstanceConfig(config)) {
        ctx.logger.info(ctx.i18n.$t("TXT_CODE_6b2a9cab"), configPath);
        ctx.storage.writeFile(configPath, JSON.stringify(config, null, 4));
      }
    } catch (error) {
      ctx.logger.error(ctx.i18n.$t("TXT_CODE_fb75aba9"), error);
    }
  }
}
