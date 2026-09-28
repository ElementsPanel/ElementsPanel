import { Logger } from "cordis";
import type { PanelPluginContext } from "../../../../src/app/plugin";

export function setupProcessLifecycle(ctx: PanelPluginContext) {
  const logger = new Logger("app");
  let stopping = false;

  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    const translate = ctx.get("i18n")?.$t;
    logger.warn(`${signal} close process signal detected.`);
    try {
      await ctx.stop();
      logger.warn(translate?.("TXT_CODE_cea5dba1") ?? "Panel has been stopped.");
      logger.warn(translate?.("TXT_CODE_b0aa2db9") ?? "Goodbye.");
      process.exit(0);
    } catch (error) {
      logger.error(error);
      process.exit(1);
    }
  };

  ctx.effect(() => {
    const onException = (error: Error) => logger.error("Uncaught exception:", error);
    const onRejection = (reason: unknown) => logger.error("Unhandled rejection:", reason);
    const onInput = (value: Buffer) => {
      if (value.toString().trim().toLowerCase() === "exit") void stop("exit");
    };
    const signals = ["SIGTERM", "SIGINT", "SIGQUIT"] as const;
    const handlers = signals.map((signal) => {
      const handler = () => void stop(signal);
      process.on(signal, handler);
      return handler;
    });
    process.on("uncaughtException", onException);
    process.on("unhandledRejection", onRejection);
    process.stdin.on("data", onInput);
    return () => {
      signals.forEach((signal, index) => process.off(signal, handlers[index]));
      process.off("uncaughtException", onException);
      process.off("unhandledRejection", onRejection);
      process.stdin.off("data", onInput);
    };
  });
}
