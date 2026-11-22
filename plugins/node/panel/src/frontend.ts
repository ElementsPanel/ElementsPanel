import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import * as nodeApi from "./api";
import { useRemoteNode } from "./hooks/useRemoteNode";
import { localeMessages } from "./i18n";
import { registerNodeManagement, registerNodeDesktop } from "./management/frontend";
import { registerNodeImages } from "./image/frontend";

export const inject = ["console", "i18n", "routes", "ui", "desktop"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.set("node", { api: nodeApi, useRemoteNode });
  const breadcrumb = registerNodeManagement(ctx);
  registerNodeImages(ctx, breadcrumb);
  registerNodeDesktop(ctx);
}
