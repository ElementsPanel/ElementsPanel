import type { PanelPluginContext } from "../../../../../../core/panel/src/app/plugin";
import { registerTerminalRoutes } from "./terminal_router";
import { setPluginContext } from "./runtime";
import { registerTerminalSettings } from "./settings";

export async function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  registerTerminalRoutes(await registerTerminalSettings(ctx));
}
