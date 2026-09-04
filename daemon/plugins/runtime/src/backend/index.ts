import fs from "fs-extra";
import {
  GOLANG_ZIP_PATH,
  LOCAL_PRESET_LANG_PATH,
  PTY_PATH,
  SEVEN_ZIP_PATH,
  ZIP_TIMEOUT_SECONDS
} from "../../../../src/const";
import { compress, decompress, decompressWithProgress, listArchiveEntries } from "../../../../src/common/compress";
import { GitignoreMatcher } from "../../../../src/common/gitignore_matcher";
import StorageSubsystem from "../../../../src/common/system_storage";
import { globalConfiguration } from "../../../../src/entity/config";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { uploadFileCheckMiddleware, uploadSpeedLimitMiddleware } from "../../../../src/middlewares/precheck";
import { checkDependencies } from "../../../../src/service/dependencies";
import downloadManager from "../../../../src/service/download_manager";
import { missionPassport } from "../../../../src/service/mission_passport";
import versionAdapter from "../../../../src/service/version_adapter";
import { check7zipStatus } from "../../../../src/service/seven_zip_service";
import { getVersion, initVersionManager } from "../../../../src/service/version";
import i18next from "i18next";
import { sendFile } from "../../../../src/utils/speed_limit";

/**
 * Shared daemon bootstrap. The executable only loads plugins; this plugin
 * owns configuration, dependency checks and the reusable runtime primitives.
 */
export const inject = ["i18n"];

export async function apply(ctx: DaemonPluginContext) {
  globalConfiguration.load();
  const config = globalConfiguration.config;

  initVersionManager();
  versionAdapter.detectConfig();
  checkDependencies();

  if (fs.existsSync(LOCAL_PRESET_LANG_PATH)) {
    await i18next.changeLanguage(fs.readFileSync(LOCAL_PRESET_LANG_PATH, "utf8"));
  } else {
    const language = config.language || "en_us";
    ctx.logger.info(`LANGUAGE: ${language}`);
    await i18next.changeLanguage(language);
  }

  ctx.set("settings", {
    config,
    version: getVersion(),
    save: () => globalConfiguration.store(),
    setLanguage: (language: string) => {
      if (!language) return;
      ctx.logger.warn(ctx.i18n.$t("TXT_CODE_66e32091"), language);
      void i18next.changeLanguage(language);
      fs.remove(LOCAL_PRESET_LANG_PATH, () => {});
      config.language = language;
    }
  });
  ctx.set("storage", StorageSubsystem);
  ctx.set("middleware", {
    uploadFileCheck: uploadFileCheckMiddleware,
    uploadSpeedLimit: uploadSpeedLimitMiddleware
  });
  ctx.set("transfer", {
    passports: missionPassport,
    downloads: downloadManager,
    sendFile
  });
  ctx.set("archive", {
    GitignoreMatcher,
    compress,
    decompress,
    listArchiveEntries,
    decompressWithProgress,
    check7zipStatus,
    sevenZipPath: SEVEN_ZIP_PATH,
    zipTimeoutSeconds: ZIP_TIMEOUT_SECONDS
  });

  // Transfer helpers own process-level timers and in-flight downloads. They
  // are exposed by this foundation, so their cleanup belongs to its scope too.
  ctx.on("dispose", () => {
    missionPassport.dispose();
    downloadManager.stop();
  });
  try {
    fs.chmodSync(GOLANG_ZIP_PATH, 0o755);
    fs.chmodSync(PTY_PATH, 0o755);
  } catch (error: any) {
    ctx.logger.error(error?.message);
    ctx.logger.error(ctx.i18n.$t("TXT_CODE_a8b245fa"));
  }

  const version = getVersion();
  console.log(`
 _____ _                   _       _____             _
|   __| |___ _____ ___ ___| |_ ___|  _  |___ ___ ___| |
|   __| | -_|     | -_|   |  _|_ -|   __| .'|   | -_| |
|_____|_|___|_|_|_|___|_|_|_| |___|__|  |__,|_|_|___|_|

 + Copyright ${new Date().getFullYear()} ElementsPanel
 + Based on MCSManager
 + Version ${version}
`);

  ctx.logger.info(ctx.i18n.$t("TXT_CODE_app.welcome"));
  ctx.on("ready", () => globalConfiguration.store());
}
