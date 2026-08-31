/**
 * The panel frontend's plugin API.
 *
 * A plugin exports `apply(ctx)` and, optionally, `inject`. Everything it
 * contributes is an effect of its own scope, so unloading it undoes its routes,
 * cards, menus, actions and translations with no cleanup code of its own.
 *
 * ```ts
 * import type { PanelFrontendPluginContext } from "@/plugin";
 *
 * export const inject = ["routes", "ui"];
 *
 * export function apply(ctx: PanelFrontendPluginContext) {
 *   ctx.i18n.define(localeMessages);
 *   ctx.ui.layoutCard("ExampleCard", ExampleCard);
 *   ctx.routes.add({ path: "/example", component: ExamplePage });
 * }
 * ```
 *
 * Core code that only needs to resolve a plugin-provided service should import
 * `@/plugin/context` directly, which is deliberately import-light.
 */
export { ctx, serviceRevision, usePluginService } from "./context";
export type {
  FrontendActionsService,
  FrontendDesktopService,
  FrontendI18nService,
  FrontendMarketService,
  FrontendMenusService,
  FrontendNodeService,
  FrontendPluginsService,
  FrontendRoutesService,
  FrontendSettingsService,
  FrontendUiService,
  FrontendUserService,
  FrontendVueService,
  PanelFrontendAppMenu,
  PanelFrontendAppMenuItem,
  PanelFrontendDesktopApp,
  PanelFrontendInstanceAction,
  PanelFrontendInstanceActionContext,
  PanelFrontendLoginAction,
  PanelFrontendPluginContext,
  PanelFrontendScheduleAction,
  PanelFrontendTerminalAction,
  PanelFrontendTerminalActionContext,
  PanelFrontendTerminalButton
} from "./context";
export { setupPanelFrontendPlugins } from "./install";
export { getLoadedPlugins } from "./loader";
export type {
  LoadedPanelFrontendPlugin,
  PanelFrontendPluginMetadata,
  PanelFrontendPluginModule
} from "./loader";
