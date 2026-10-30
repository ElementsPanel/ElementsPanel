import { ctx } from "./plugin/context";
import { loadDaemonFoundationPlugin, loadDaemonPlugins } from "./plugin/loader";

async function main() {
  await loadDaemonFoundationPlugin("i18n");
  await loadDaemonFoundationPlugin("storage");
  await loadDaemonFoundationPlugin("runtime");
  await loadDaemonPlugins();
  await ctx.start();
}

main().catch(async (error) => {
  ctx.logger.error("Plugin startup failed:", error);
  await ctx.stop();
  process.exit(1);
});
