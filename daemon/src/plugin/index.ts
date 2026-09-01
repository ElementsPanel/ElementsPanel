/**
 * What a daemon plugin's backend imports.
 *
 * Only types: a plugin must never import cordis or the daemon core at runtime,
 * because both are bundled into `app.js` and a second copy of either would be a
 * second container. Everything a plugin needs arrives through the `ctx` its
 * `apply()` is called with.
 *
 * ```ts
 * import type { DaemonPluginContext } from "../../../../src/plugin";
 *
 * export const inject = ["protocol", "instances"];
 *
 * export function apply(ctx: DaemonPluginContext) {
 *   ctx.protocol.on("example/ping", (routerCtx) => {
 *     ctx.protocol.response(routerCtx, true);
 *   });
 * }
 * ```
 */
export type {
  DaemonArchiveService,
  DaemonAsyncTaskRegistration,
  DaemonFeaturesService,
  DaemonI18nService,
  DaemonInstancesService,
  DaemonKoaService,
  DaemonMiddlewareService,
  DaemonOverviewProvider,
  DaemonOverviewService,
  DaemonPluginContext,
  DaemonPluginsService,
  DaemonPresetCommandFactory,
  DaemonPresetsService,
  DaemonProtocolService,
  DaemonScheduleActionHandler,
  DaemonSchedulesService,
  DaemonSettingsService,
  DaemonTasksService,
  DaemonWebsocketService
} from "./context";
export type { DaemonPluginEntry, DaemonPluginModule } from "./loader";
