import { StorageSubsystem } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../src/plugin";

const storage = new StorageSubsystem();

export const inject: string[] = [];

export function apply(ctx: DaemonPluginContext) {
  ctx.set("storage", storage);
}
