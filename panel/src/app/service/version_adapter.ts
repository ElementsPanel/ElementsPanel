import type { PanelStorageService } from "../plugin/context";
import { $t } from "../i18n";
import { logger } from "./log";

function readCategoryConfig(storage: PanelStorageService, configCategory: string, callback: (config: any) => boolean) {
  const configPaths = storage.readDir(configCategory);
  for (const configPath of configPaths) {
    try {
      const config = JSON.parse(storage.readFile(configPath));
      if (callback(config)) {
        logger.info($t("TXT_CODE_6b2a9cab"), configPath);
        storage.writeFile(configPath, JSON.stringify(config, null, 4));
      }
    } catch (error: any) {
      logger.error($t("TXT_CODE_fb75aba9"), error);
    }
  }
}

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

function detectConfig(storage: PanelStorageService) {
  readCategoryConfig(storage, "User", refactorUserConfig);
}

export default { detectConfig };
