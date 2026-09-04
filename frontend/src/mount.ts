import { createApp } from "vue";
import { createPinia } from "pinia";

import { router } from "./config/router";
import { getI18nInstance, t } from "@/lang/i18n";
import App from "./App.vue";

import { useAppStateStore } from "./stores/useAppStateStore";
import { ctx } from "./plugin/context";
import { setupPanelFrontendPlugins } from "./plugin/install";

window.addEventListener("unhandledrejection", function (event) {
  console.error("Unhandled promise rejection:", event.reason);
});

const { updateUserInfo } = useAppStateStore();

export async function mountApp() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(getI18nInstance());

  // Plugins first: "console" owns the shell and base routes, while "user"
  // owns the optional account API and login route, so the session below cannot
  // be restored until the installed plugins have registered their services.
  await setupPanelFrontendPlugins(app, pinia);

  try {
    await updateUserInfo();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const expectedAuthErrors = [
      t("TXT_CODE_permission.forbidden"),
      t("TXT_CODE_permission.forbiddenTokenError")
    ];
    if (!expectedAuthErrors.includes(message)) {
      console.error("Init user info Error:", err);
    }
  }

  app.use(router);
  app.mount("#app-mount-point");
  // The app is mounted and the session restored: plugins that were waiting for
  // either can run now.
  await ctx.start();
}
