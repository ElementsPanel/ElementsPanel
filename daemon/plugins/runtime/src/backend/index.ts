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
import { globalConfiguration } from "../../../../src/entity/config";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { checkDependencies } from "../../../../src/service/dependencies";
import downloadManager from "../../../../src/service/download_manager";
import { missionPassport } from "../../../../src/service/mission_passport";
import versionAdapter from "../../../../src/service/version_adapter";
import { check7zipStatus } from "../../../../src/service/seven_zip_service";
import { getVersion, initVersionManager } from "../../../../src/service/version";
import i18next from "i18next";
import { proxyIncomingMessage, sendFile } from "../../../../src/utils/speed_limit";
import type { Context as KoaContext } from "koa";

function isMultipart(requestCtx: KoaContext) {
  return String(requestCtx.request?.headers?.["content-type"] ?? "")
    .toLowerCase()
    .includes("multipart");
}

/**
 * These middleware functions are created by the runtime plugin so their
 * upload state is read from this live context. Importing the old core helpers
 * here would bundle a second `ctx` and make valid upload writers invisible.
 */
function createUploadMiddleware(ctx: DaemonPluginContext) {
  const uploadFileCheck = async (requestCtx: KoaContext, next: () => Promise<void>) => {
    if (!isMultipart(requestCtx)) return await next();

    const pathName = new URL(`${requestCtx.origin}${requestCtx.url}`).pathname;
    const segments = pathName.trim().split("/").filter(Boolean);
    const uploadKey = segments[segments.length - 1] || "";
    const files = ctx.get("files");
    const pieceWriter = files?.uploads.get(uploadKey);
    const uploadMission = ctx.transfer.passports.getMission(uploadKey, "upload");
    if (pieceWriter || uploadMission) return await next();

    throw new Error("Access denied: Invalid multipart request!");
  };

  const uploadSpeedLimit = async (requestCtx: KoaContext, next: () => Promise<void>) => {
    if (!isMultipart(requestCtx)) return await next();
    const rate = Number(ctx.settings.config.uploadSpeedRate) || 0;
    if (rate <= 0) return await next();
    requestCtx.req = proxyIncomingMessage(requestCtx.req, rate);
    return await next();
  };

  return { uploadFileCheck, uploadSpeedLimit };
}

/**
 * Shared daemon bootstrap. The executable only loads plugins; this plugin
 * follows the storage foundation and owns configuration, dependency checks and
 * the reusable runtime primitives.
 */
export const inject = ["i18n", "storage"];

export async function apply(ctx: DaemonPluginContext) {
  globalConfiguration.configure(ctx.storage);
  globalConfiguration.load();
  const config = globalConfiguration.config;

  initVersionManager();
  versionAdapter.detectConfig(ctx.storage);
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
  const uploadMiddleware = createUploadMiddleware(ctx);
  ctx.set("middleware", {
    uploadFileCheck: uploadMiddleware.uploadFileCheck,
    uploadSpeedLimit: uploadMiddleware.uploadSpeedLimit
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
