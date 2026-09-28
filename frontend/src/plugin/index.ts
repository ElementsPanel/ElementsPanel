/**
 * The panel frontend's plugin API.
 *
 * A plugin exports `apply(ctx)` and, optionally, `inject`. Everything it
 * contributes is an effect of its own scope, so unloading it undoes its routes,
 * menus, actions and translations with no cleanup code of its own.
 *
 * ```ts
 * import type { PanelFrontendPluginContext } from "@/plugin";
 *
 * export const inject = ["console", "routes", "ui"];
 *
 * export function apply(ctx: PanelFrontendPluginContext) {
 *   ctx.i18n.define(localeMessages);
 *   ctx.slots.register("shell.header.actions", ExampleWidget, { id: "example" });
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
  FrontendConsoleService,
  FrontendConnectionService,
  FrontendConnectionState,
  FrontendConnectionStatus,
  FrontendStartupService,
  FrontendI18nService,
  FrontendInstanceService,
  FrontendMarketService,
  FrontendModManagerService,
  FrontendJavaService,
  FrontendMenusService,
  FrontendFileManagerService,
  FrontendTerminalService,
  FrontendNodeService,
  FrontendPluginsService,
  FrontendRoutesService,
  FrontendSlotsService,
  FrontendUiService,
  FrontendUserService,
  FrontendVueService,
  PanelFrontendAppMenu,
  PanelFrontendAppMenuItem,
  PanelFrontendDesktopApp,
  PanelFrontendDesktopView,
  PanelFrontendDesktopWindowRequest,
  PanelFrontendInstanceAction,
  PanelFrontendInstanceActionContext,
  PanelFrontendLoginAction,
  PanelFrontendPluginDiagnostic,
  PanelFrontendPluginContext,
  PanelLanguageOption,
  PanelFrontendScheduleAction,
  PanelFrontendSlotEntry,
  PanelFrontendSlotMap,
  PanelFrontendSlotName,
  PanelFrontendSlotProps,
  PanelFrontendSlotRegistration,
  PanelFrontendTerminalAction,
  PanelFrontendTerminalActionContext,
  PanelFrontendTerminalButton
} from "./context";
export { setupPanelFrontendPlugins } from "./install";
export { auditFrontendPlugins, getLoadedPlugins, getPluginDiagnostics } from "./loader";
export type {
  LoadedPanelFrontendPlugin,
  PanelFrontendPluginMetadata,
  PanelFrontendPluginModule
} from "./loader";
