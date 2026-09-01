/**
 * What a panel plugin's backend imports.
 *
 * Only types: a plugin must never import cordis or the panel core at runtime,
 * because both are bundled into `app.js` and a second copy of either would be a
 * second container. Everything a plugin needs arrives through the `ctx` its
 * `apply()` is called with.
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
  PanelInstallationService,
  PanelKoaService,
  PanelMiddlewareService,
  PanelOverviewProvider,
  PanelOverviewService,
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
