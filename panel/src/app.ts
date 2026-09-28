import { ctx } from "./app/plugin/context";
import { loadPanelFoundationPlugin, loadPanelPlugins } from "./app/plugin/loader";

async function main() {
  await loadPanelFoundationPlugin("i18n");
  await loadPanelFoundationPlugin("storage");
  await loadPanelFoundationPlugin("runtime");
  await loadPanelPlugins();
  await ctx.start();
}

main().catch(async (error) => {
  ctx.logger.error("Plugin startup failed:", error);
  await ctx.stop();
  process.exit(1);
});
