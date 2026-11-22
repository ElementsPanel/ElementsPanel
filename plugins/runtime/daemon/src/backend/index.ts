import fs from "fs-extra";
import i18next from "i18next";
import type { Context as KoaContext } from "koa";
import { ensureExecutable } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import {
  compress,
  decompress,
  decompressWithProgress,
  listArchiveEntries
} from "./common/compress";
import { GitignoreMatcher } from "./common/gitignore_matcher";
import {
  GOLANG_ZIP_PATH,
  LOCAL_PRESET_LANG_PATH,
  PTY_PATH,
  SEVEN_ZIP_PATH,
  ZIP_TIMEOUT_SECONDS
} from "./const";
import { Config, globalConfiguration } from "./entity/config";
import { setupProcessLifecycle } from "./lifecycle";
import { registerOverview } from "./overview";
import { FeaturesService, OverviewService } from "./registries";
import { BackgroundTasks } from "./service/background_tasks";
import { checkDependencies } from "./service/dependencies";
import downloadManager from "./service/download_manager";
import { setupLogging } from "./service/log";
import { missionPassport } from "./service/mission_passport";
import { check7zipStatus } from "./service/seven_zip_service";
import { getVersion, initVersionManager } from "./service/version";
import { proxyIncomingMessage, sendFile } from "./utils/speed_limit";

function isMultipart(requestCtx: KoaContext) {
  return String(requestCtx.request?.headers?.["content-type"] ?? "")
    .toLowerCase()
    .includes("multipart");
}

function createUploadMiddleware(ctx: DaemonPluginContext) {
  const uploadFileCheck = async (requestCtx: KoaContext, next: () => Promise<void>) => {
    if (!isMultipart(requestCtx)) return await next();

    const pathName = new URL(`${requestCtx.origin}${requestCtx.url}`).pathname;
    const segments = pathName.trim().split("/").filter(Boolean);
    const uploadKey = segments[segments.length - 1] || "";
    const files = ctx.get("files");
    const pieceWriter = files?.uploads.get(uploadKey);
    // Both services are provided by this plugin, so read them through `get()`
    // instead of as injected properties.
    const uploadMission = ctx.get("transfer")?.passports.getMission(uploadKey, "upload");
    if (pieceWriter || uploadMission) return await next();

    throw new Error("Access denied: Invalid multipart request!");
  };

  const uploadSpeedLimit = async (requestCtx: KoaContext, next: () => Promise<void>) => {
    if (!isMultipart(requestCtx)) return await next();
    const rate = Number(ctx.get("settings")?.config.uploadSpeedRate) || 0;
    if (rate <= 0) return await next();
    requestCtx.req = proxyIncomingMessage(requestCtx.req, rate);
    return await next();
  };

  return { uploadFileCheck, uploadSpeedLimit };
}

export const inject = ["i18n", "storage"];

export async function apply(ctx: DaemonPluginContext) {
  const backgroundTasks = new BackgroundTasks();
  ctx.set("backgroundTasks", backgroundTasks);
  downloadManager.backgroundTasks = backgroundTasks;
  ctx.plugin(FeaturesService);
  ctx.plugin(OverviewService);
  ctx.on("dispose", () => {
    missionPassport.dispose();
    downloadManager.stop();
    backgroundTasks.dispose();
  });
  setupLogging(ctx);
  setupProcessLifecycle(ctx);
  globalConfiguration.configure(ctx.storage);
  globalConfiguration.load();
  const config = globalConfiguration.config;

  initVersionManager();
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
    defaults: () => new Config(),
    version: getVersion(),
    save: () => globalConfiguration.store(),
    setLanguage: (language: string) => {
      if (!language) return;
      ctx.logger.warn(ctx.i18n.$t("TXT_CODE_COMMON_NODE_LANGUAGE_HAS_BEEN_CHANGED"), language);
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
  ctx.inject(["protocol", "features", "overview", "settings"], registerOverview);
  ctx.inject(["protocol"], (scope) => {
    scope.effect(() => {
      const push = ({ owner, tasks }: { owner: string; tasks: any[] }) =>
        scope.protocol.broadcast("tasks/update", { owner, tasks });
      backgroundTasks.on("changed", push);
      return () => backgroundTasks.off("changed", push);
    });
    scope.protocol.on("tasks/list", (request, data) => {
      scope.protocol.response(request, backgroundTasks.list(String(data?.owner || "")));
    });
    scope.protocol.on("tasks/cancel", (request, data) => {
      scope.protocol.response(
        request,
        backgroundTasks.cancel(String(data?.owner || ""), String(data?.id || ""))
      );
    });
    scope.protocol.on("tasks/clear", (request, data) => {
      backgroundTasks.clear(String(data?.owner || ""));
      scope.protocol.response(request, true);
    });
  });

  try {
    ensureExecutable(GOLANG_ZIP_PATH);
    ensureExecutable(PTY_PATH);
  } catch (error: any) {
    ctx.logger.error(error?.message);
    ctx.logger.error(ctx.i18n.$t("TXT_CODE_DAEMON_MODULE_INITIALIZATION_FAILED"));
  }

  const version = getVersion();
  console.log(`
  ▄▄▄▄▄▄▄ ▄▄                                       ▄▄▄▄▄▄                 ▄▄ 
 █▀██▀▀▀   ██                            █▄       █▀██▀▀▀█▄                ██
   ██      ██       ▄              ▄    ▄██▄        ██▄▄▄█▀    ▄           ██
   ████    ██ ▄█▀█▄ ███▄███▄ ▄█▀█▄ ████▄ ██ ▄██▀█   ██▀▀▀▄▀▀█▄ ████▄ ▄█▀█▄ ██
   ██      ██ ██▄█▀ ██ ██ ██ ██▄█▀ ██ ██ ██ ▀███▄ ▄ ██   ▄█▀██ ██ ██ ██▄█▀ ██
   ▀█████ ▄██▄▀█▄▄▄▄██ ██ ▀█▄▀█▄▄▄▄██ ▀█▄███▄▄██▀ ▀██▀  ▄▀█▄██▄██ ▀█▄▀█▄▄▄▄██

 + Copyright ${new Date().getFullYear()} ElementsPanel
 + Based on MCSManager
 + Version ${version}
`);

  ctx.logger.info(ctx.i18n.$t("TXT_CODE_APP_WELCOME"));
  ctx.on("ready", () => globalConfiguration.store());
}
