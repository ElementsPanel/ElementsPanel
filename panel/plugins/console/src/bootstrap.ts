import { createApp } from "vue";
import { createPinia } from "pinia";
import type { PanelFrontendPluginContext } from "@/plugin";
import { getI18nInstance } from "@/lang/i18n";
import { router } from "./config/router";
import { useAppStateStore } from "./stores/useAppStateStore";
import { setLoadingTitle } from "./tools/dom";
import ConsoleApp from "./ConsoleApp.vue";
import {
  ActionsService,
  DesktopService,
  MenusService,
  RoutesService,
  UiService,
  VueService
} from "./plugin/services";

export async function prepareApplication(ctx: PanelFrontendPluginContext) {
  const app = createApp(ConsoleApp);
  const pinia = createPinia();
  app.use(pinia);
  app.use(getI18nInstance());

  ctx.plugin(VueService, { app, pinia });
  ctx.plugin(RoutesService);
  ctx.plugin(UiService);
  ctx.plugin(MenusService);
  ctx.plugin(ActionsService);
  ctx.plugin(DesktopService);

  const applicationContext = await new Promise<PanelFrontendPluginContext>((resolve) => {
    ctx.inject(["vue", "routes", "ui", "menus", "actions", "desktop"], (scope) => resolve(scope));
  });

  let mounted = false;
  ctx.on("plugins/loaded", async () => {
    const user = ctx.get("user");
    if (user) await user.restoreSession();
    else await useAppStateStore().updateUserInfo();
    setLoadingTitle("Rendering Application...");
    app.use(router);
    app.mount("#app-mount-point");
    mounted = true;
  });
  ctx.on("dispose", () => {
    if (mounted) app.unmount();
  });
  return { app, ctx: applicationContext };
}
