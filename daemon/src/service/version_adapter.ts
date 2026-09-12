import type { DaemonStorageService } from "../plugin/context";
import logger from "./log";
import { $t } from "../i18n";

function readCategoryConfig(storage: DaemonStorageService, configCategory: string, callback: (config: any) => boolean) {
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

function refactorInstanceConfig(config: any) {
  if (isNaN(config.passWordType)) config.passWordType = 0;
  if (typeof config.endTime === "string") {
    config.endTime = new Date(config.endTime).getTime();
    return true;
  }
  return false;
}

function detectConfig(storage: DaemonStorageService) {
  readCategoryConfig(storage, "InstanceConfig", refactorInstanceConfig);
}

export default { detectConfig };
