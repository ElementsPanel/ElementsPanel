const RESTART = Symbol.for("elementspanel.process.restart");

interface RestartContext {
  root: RestartContext;
  [RESTART]?: { pending: boolean };
  parallel(event: "process/restarting"): Promise<unknown>;
  stop(): Promise<unknown>;
  logger: { error(...args: unknown[]): void };
}

export function isProcessRestartPending(ctx: RestartContext): boolean {
  return ctx.root[RESTART]?.pending === true;
}

export function canRestartProcess(): boolean {
  return process.env.EPANEL_SUPERVISED === "1" && Boolean(process.connected && process.send);
}

/** The CLI retains instance processes and starts a fresh worker after this one exits. */
export function requestProcessRestart(
  ctx: RestartContext,
  settle: () => Promise<void>,
  ready: () => Promise<unknown> = async () => {}
): boolean {
  if (isProcessRestartPending(ctx)) return true;
  if (!canRestartProcess()) return false;
  const state: NonNullable<RestartContext[typeof RESTART]> = { pending: true };
  ctx.root[RESTART] = state;
  const retainProcesses = () =>
    new Promise<void>((resolve, reject) =>
      process.send!({ type: "elementspanel:prepare-restart" }, (error: Error | null) =>
        error ? reject(error) : resolve()
      )
    );
  setImmediate(() => {
    void (async () => {
      await ready();
      // Detach output consumers before cleanup so output and exits during the
      // restart are retained for the next daemon generation.
      await retainProcesses();
      await ctx.parallel("process/restarting");
      // A pending start can finish while restart hooks are awaiting it.
      await retainProcesses();
      await ctx.stop();
      await settle();
      process.send!({ type: "elementspanel:restart" }, (error: Error | null) =>
        process.exit(error ? 1 : 0)
      );
    })().catch((error) => {
      ctx.logger.error("Failed to restart the process:", error);
      process.exit(1);
    });
  });
  return true;
}
