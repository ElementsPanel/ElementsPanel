import fs from "fs-extra";
import type { Context } from "cordis";
import { LOCAL_PRESET_LANG_PATH, SEVEN_ZIP_PATH, ZIP_TIMEOUT_SECONDS } from "../const";
import { compress, decompress, decompressWithProgress, listArchiveEntries } from "../common/compress";
import { GitignoreMatcher } from "../common/gitignore_matcher";
import { globalConfiguration } from "../entity/config";
import StorageSubsystem from "../common/system_storage";
import i18next from "i18next";
import { $t } from "../i18n";
import { uploadFileCheckMiddleware, uploadSpeedLimitMiddleware } from "../middlewares/precheck";
import downloadManager from "../service/download_manager";
import logger from "../service/log";
import { missionPassport } from "../service/mission_passport";
import { sendFile } from "../utils/speed_limit";
import { check7zipStatus } from "../service/seven_zip_service";
import { ctx } from "./context";
import { getDaemonPluginInventory, getLoadedDaemonPlugins, setDaemonPluginEnabled } from "./loader";
import { ProtocolService } from "./protocol";
import { SettingsFormService } from "./settings";
import {
  FeaturesService,
  LifecycleService,
  OverviewService,
  PresetsService,
  SchedulesService,
  TasksService
} from "./registries";

/**
 * Declares a builtin service and stores its value as it is.
 *
 * `ctx.provide(name, value)` stamps cordis's tracker symbol onto the value, so
 * every read of it returns a `Proxy`, and a method that uses a `#private` field
 * or a `WeakMap` keyed by `this` then fails because `this` is the proxy. Only the
 * `Service` classes need that tracing, so a singleton the core already owns is
 * handed over untouched: declare the slot with no value, then set it.
 */
function provide<K extends keyof Context & string>(name: K, value: Context[K]) {
  ctx.provide(name, undefined, true);
  ctx.set(name, value);
}

/**
 * Wires the daemon's singletons onto the container, once, at startup.
 *
 * A service that only hands a plugin something the core already owns is a plain
 * builtin value: there is nothing to scope and nothing to dispose. The services
 * that accept registrations from plugins are `Service` classes, because a
 * registration has to belong to the plugin that made it. The foundational `i18n`
 * plugin is loaded before this function. `logger` and the timer helpers come from
 * cordis itself.
 *
 * `koa` and `websocket` are deliberately absent: they are the daemon's network
 * layer, provided by `plugins/server` with `ctx.set()`.
 */
export function installDaemonPluginServices() {
  provide("settings", {
    config: globalConfiguration.config,
    save: () => globalConfiguration.store(),
    setLanguage: (language: string) => {
      if (!language) return;
      logger.warn($t("TXT_CODE_66e32091"), language);
      i18next.changeLanguage(language);
      fs.remove(LOCAL_PRESET_LANG_PATH, () => {});
      globalConfiguration.config.language = language;
    }
  });
  provide("storage", StorageSubsystem);
  provide("middleware", {
    uploadFileCheck: uploadFileCheckMiddleware,
    uploadSpeedLimit: uploadSpeedLimitMiddleware
  });
  provide("transfer", {
    passports: missionPassport,
    downloads: downloadManager,
    sendFile
  });
  provide("archive", {
    GitignoreMatcher,
    compress,
    decompress,
    listArchiveEntries,
    decompressWithProgress,
    check7zipStatus,
    sevenZipPath: SEVEN_ZIP_PATH,
    zipTimeoutSeconds: ZIP_TIMEOUT_SECONDS
  });
  provide("plugins", {
    get loaded() {
      return getLoadedDaemonPlugins();
    },
    inventory: getDaemonPluginInventory,
    setEnabled: setDaemonPluginEnabled
  });

  ctx.plugin(SettingsFormService);
  ctx.plugin(ProtocolService);
  ctx.plugin(TasksService);
  ctx.plugin(LifecycleService);
  ctx.plugin(PresetsService);
  ctx.plugin(SchedulesService);
  ctx.plugin(FeaturesService);
  ctx.plugin(OverviewService);
}
