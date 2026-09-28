/**
 * What a daemon plugin's backend imports.
 *
 * Import only types from this host module: a runtime import can bundle a second
 * host context. Shared services arrive through the `ctx` passed to `apply()`.
 * Cordis itself is externalized in host and plugin bundles, so importing its
 * Service or Logger at runtime uses the same installed framework instance.
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
  DaemonFileManager,
  DaemonFilesService,
  DaemonI18nService,
  DaemonInstancesService,
  DaemonLifecycleService,
  DaemonLifecycleTaskFactory,
  DaemonJavaManagerService,
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
  DaemonSettingField,
  DaemonSettingFieldType,
  DaemonSettingOption,
  DaemonSettingsDeclaration,
  DaemonSettingsFormService,
  DaemonSettingsSchema,
  DaemonSettingsService,
  DaemonStorageService,
  DaemonTasksService,
  DaemonTransferService,
  DaemonUploadTask,
  DaemonWebsocketService
} from "./context";
export type { DaemonPluginEntry, DaemonPluginModule, DaemonPluginRecord } from "./loader";
