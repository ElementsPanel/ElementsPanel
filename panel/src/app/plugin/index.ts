/**
 * What a panel plugin's backend imports.
 *
 * Import only types from this host module: a runtime import can bundle a second
 * host context. Shared services arrive through the `ctx` passed to `apply()`.
 * Cordis itself is externalized in host and plugin bundles, so importing its
 * Service or Logger at runtime uses the same installed framework instance.
 *
 * ```ts
 * import type { PanelPluginContext } from "../../../../src/app/plugin";
 *
 * export const inject = ["koa", "i18n"];
 *
 * export function apply(ctx: PanelPluginContext) {
 *   ctx.i18n.define(localeMessages);
 *   const router = ctx.koa.router("/api/example");
 *   router.get("/", async (c) => { c.body = "hello"; });
 * }
 * ```
 */
export type {
  PanelI18nService,
  PanelIdentityService,
  PanelKoaService,
  PanelLayoutService,
  PanelMiddlewareService,
  PanelOverviewProvider,
  PanelOverviewService,
  PanelOperationLogger,
  PanelStorageService,
  PanelPluginContext,
  PanelPluginsService,
  PanelRemoteService,
  PanelSettingField,
  PanelSettingFieldType,
  PanelSettingOption,
  PanelSettingsDeclaration,
  PanelSettingsFormService,
  PanelSettingsSchema,
  PanelSettingsService
} from "./context";
export type {
  LoadedPanelPlugin,
  PanelFrontendPluginEntry,
  PanelPluginModule,
  PanelPluginRecord
} from "./loader";
