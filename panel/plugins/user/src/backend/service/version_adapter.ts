import type { PanelPluginContext } from "../../../../../src/app/plugin";

function refactorUserConfig(config: any) {
  let changed = false;
  const { instances } = config;
  if (instances instanceof Array && instances.length > 0) {
    for (const iterator of instances) {
      if (typeof iterator.serviceUuid === "string") {
        iterator.daemonId = iterator.serviceUuid;
        delete iterator.serviceUuid;
        changed = true;
      }
    }
  }
  return changed;
}

export function migrateConfig(ctx: PanelPluginContext) {
  for (const configPath of ctx.storage.readDir("User")) {
    try {
      const config = JSON.parse(ctx.storage.readFile(configPath));
      if (refactorUserConfig(config)) {
        ctx.logger.info(ctx.i18n.$t("TXT_CODE_6b2a9cab"), configPath);
        ctx.storage.writeFile(configPath, JSON.stringify(config, null, 4));
      }
    } catch (error) {
      ctx.logger.error(ctx.i18n.$t("TXT_CODE_fb75aba9"), error);
    }
  }
}
