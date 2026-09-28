import { ctx } from "./plugin/context";
import { setupPanelFrontendPlugins } from "./plugin/install";

setupPanelFrontendPlugins().catch(async (error) => {
  console.error("Plugin startup failed:", error);
  const startup = ctx.get("startup");
  if (startup) startup.showError(error);
  else {
    const host = window as Window & { setAppLoadingError?: (message: string) => void };
    host.setAppLoadingError?.(error instanceof Error ? error.message : String(error));
  }
  await ctx.stop();
});
