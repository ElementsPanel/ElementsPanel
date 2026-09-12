import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { createModPageLayout } from "../layout";
import { ModManagerService } from "./mod_manager";
import { registerModManagerRoutes } from "./router";

export const inject = ["koa", "i18n", "remote", "middleware", "roles", "identity"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  const manager = new ModManagerService(ctx);
  registerModManagerRoutes(ctx, manager);

  // The HTTP API also works without the browser shell. Its default page layout
  // belongs to this plugin and is registered only while the shell is present.
  ctx.inject(["layout"], (scoped) => {
    scoped.layout.provide(() =>
      createModPageLayout(String(scoped.i18n.$t("TXT_CODE_MOD_MANAGER")))
    );
  });
}
