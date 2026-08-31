import fs from "fs-extra";
import type Koa from "koa";
import type { Context } from "cordis";
import { LOCAL_PRESET_LANG_PATH, SEVEN_ZIP_PATH, ZIP_TIMEOUT_SECONDS } from "../const";
import { decompressWithProgress } from "../common/compress";
import { GitignoreMatcher } from "../common/gitignore_matcher";
import { getCommonHeaders } from "../common/network";
import { globalConfiguration } from "../entity/config";
import Instance from "../entity/instance/instance";
import InstanceConfig from "../entity/instance/Instance_config";
import InstanceCommand from "../entity/commands/base/command";
import i18next from "i18next";
import { $t } from "../i18n";
import { getFileManager } from "../service/file_router_service";
import { InstanceUpdateAction } from "../service/instance_update_action";
import logger from "../service/log";
import { check7zipStatus } from "../service/seven_zip_service";
import InstanceSubsystem from "../service/system_instance";
import { ctx } from "./context";
import { I18nService } from "./i18n";
import { KoaService } from "./koa";
import { getLoadedDaemonPlugins } from "./loader";
import { ProtocolService } from "./protocol";
import {
  FeaturesService,
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
 * builtin value: there is nothing to scope and nothing to dispose. The ones that
 * accept registrations from plugins are `Service` classes, because a registration
 * has to belong to the plugin that made it. `logger` and the timer helpers come
 * from cordis itself.
 */
export function installDaemonPluginServices(app: Koa) {
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
  provide("instances", {
    subsystem: InstanceSubsystem,
    Instance,
    Config: InstanceConfig,
    Command: InstanceCommand,
    UpdateAction: InstanceUpdateAction,
    fileManager: getFileManager,
    headers: getCommonHeaders
  });
  provide("archive", {
    GitignoreMatcher,
    decompressWithProgress,
    check7zipStatus,
    sevenZipPath: SEVEN_ZIP_PATH,
    zipTimeoutSeconds: ZIP_TIMEOUT_SECONDS
  });
  provide("plugins", {
    get loaded() {
      return getLoadedDaemonPlugins();
    }
  });

  ctx.plugin(I18nService);
  ctx.plugin(ProtocolService);
  ctx.plugin(TasksService);
  ctx.plugin(PresetsService);
  ctx.plugin(SchedulesService);
  ctx.plugin(FeaturesService);
  ctx.plugin(OverviewService);
  ctx.plugin(KoaService, app);
}
