import type Koa from "koa";
import type { Context } from "cordis";
import { GlobalVariable } from "mcsmanager-common";
import Storage from "../common/storage/sys_storage";
import { ROLE } from "../entity/user";
import { speedLimit } from "../middleware/limit";
import permission from "../middleware/permission";
import instanceAccess from "../middleware/instance_access";
import validator from "../middleware/validator";
import { getInstancesByUuid } from "../service/instance_service";
import { operationLogger } from "../service/operation_logger";
import { getRequestGuard } from "../service/request_guard";
import { saveSystemConfig, systemConfig } from "../setting";
import { ctx } from "./context";
import { I18nService } from "./i18n";
import {
  getLoadedPanelPlugins,
  getPanelFrontendManifest,
  getPanelPluginInventory,
  setPanelPluginEnabled
} from "./loader";
import { OverviewService } from "./overview";
import { SettingsFormService } from "./settings";

/**
 * Declares a builtin service and stores its value as it is.
 *
 * `ctx.provide(name, value)` stamps cordis's tracker symbol onto the value, so
 * every read of it returns a `Proxy`. A method that uses a `#private` field or a
 * `WeakMap` keyed by `this` then fails, because `this` is the proxy — the panel's
 * operation logger is exactly such an object. Only the `Service` classes need
 * that tracing, so a singleton the core already owns is handed over untouched:
 * declare the slot with no value, then set it.
 */
function provide<K extends keyof Context & string>(name: K, value: Context[K]) {
  ctx.provide(name, undefined, true);
  ctx.set(name, value);
}

/**
 * Wires the panel's singletons onto the container, once, at startup.
 *
 * A service that only hands a plugin something the core already owns is a plain
 * builtin value: there is nothing to scope and nothing to dispose. The three that
 * accept registrations from plugins — `i18n`, `settingsForm` and `overview` —
 * are `Service` classes, because a registration has to belong to the plugin that
 * made it. `logger` and the timer helpers come from cordis itself.
 *
 * `koa`, `remote`, `guard` and `installation` are deliberately absent: they are
 * provided by plugins with `ctx.set()`. `koa` comes from `plugins/server`, which
 * owns the whole web server, and `remote` from `plugins/node`, which owns the
 * daemon connections; the other two are read through a core accessor that falls
 * back to a default so the panel works without the owning plugin.
 */
export function installPanelPluginServices() {
  provide("settings", { config: systemConfig!, save: () => saveSystemConfig(systemConfig!) });
  provide("storage", Storage);
  provide("middleware", { permission, validator, instanceAccess, speedLimit });
  provide("roles", ROLE);
  provide("identity", {
    of: (requestCtx: Koa.ParameterizedContext) => getRequestGuard().identify(requestCtx),
    // Getters: the guard arrives with a plugin, after this runs, and can be
    // removed again while the panel is running.
    get accessPolicy() {
      return getRequestGuard().accessPolicy();
    },
    get users() {
      return getRequestGuard().users;
    },
    get stats() {
      return getRequestGuard().stats();
    }
  });
  provide("operations", operationLogger);
  provide("instances", { getByUuid: getInstancesByUuid });
  provide("globals", GlobalVariable);
  provide("plugins", {
    get loaded() {
      return getLoadedPanelPlugins();
    },
    frontendManifest: getPanelFrontendManifest,
    inventory: getPanelPluginInventory,
    setEnabled: setPanelPluginEnabled
  });

  ctx.plugin(I18nService);
  ctx.plugin(SettingsFormService);
  ctx.plugin(OverviewService);
}
