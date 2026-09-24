/** Stable browser entry for independently compiled plugins (SDK major 1). */
export { ctx, serviceRevision, usePluginService } from "./context";
export type { PanelFrontendPluginContext, PanelFrontendPluginModule } from "./index";
export type {
  FrontendDesktopService,
  PanelFrontendDesktopApp,
  PanelFrontendDesktopView,
  PanelFrontendDesktopWindowRequest
} from "./context";
export { PLUGIN_API_VERSION, PLUGIN_SDK_VERSION } from "../../../common/src/plugin_contract";
export * from "../../../common/src/instance_contract";
