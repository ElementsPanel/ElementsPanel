import type { PanelFrontendPluginContext } from "@/plugin";
import { localeMessages } from "./i18n";
import PluginConfig from "./PluginConfig.vue";

// The web server has no page of its own: everything it does happens before any
// route is matched. All it contributes to the browser is the form that edits its
// own settings, on the `config` plugin's page.

export const inject = ["i18n", "settings"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.settings.page(PluginConfig);
}
