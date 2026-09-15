import { Logger } from "cordis";
import type { DaemonPluginContext } from "../../../../src/plugin";

export function setupProcessLifecycle(ctx: DaemonPluginContext) {
  const logger = new Logger("app");
  let stopping = false;

  const stop = async (signal: string) => {
    const translate = ctx.get("i18n")?.$t;
    if (stopping) {
      logger.warn(translate?.("TXT_CODE_6f862823") ?? "Shutdown already in progress.");
      return;
    }
    stopping = true;
    logger.warn(translate?.("TXT_CODE_4ffdc91d", { signal }) ?? signal);
    try {
      await ctx.stop();
      logger.info(translate?.("TXT_CODE_dff680b7") ?? "Shutdown complete.");
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
