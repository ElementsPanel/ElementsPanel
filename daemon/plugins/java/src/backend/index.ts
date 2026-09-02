import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { registerJavaManagerRoutes } from "./java_router";
import { JavaManager } from "./java_manager";

// Java runtime management for the daemon. The manager and its protocol handlers
// are scoped to this plugin, while instance startup resolves the service through
// the daemon context so the core has no Java-specific import.
export const inject = [
  "i18n",
  "settings",
  "storage",
  "instances",
  "protocol",
  "files",
  "transfer",
  "features"
];

export async function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const javaManager = new JavaManager({
    defaultJavaDataPath: ctx.settings.config.defaultJavaDataPath,
    storage: ctx.storage,
    translate: ctx.i18n.$t
  });
  await javaManager.ready;
  ctx.set("javaManager", javaManager);
  ctx.features.add("javaManager");

  registerJavaManagerRoutes(ctx, javaManager);

  const updateUsage = (obj: { instanceUuid: string }, using: boolean) => {
    const config = ctx.instances.subsystem.getInstance(obj.instanceUuid)?.config;
    const javaId = config?.java.id;
    if (!javaId) return;
    const java = javaManager.getJava(javaId);
    if (!java) return;
    java.usingInstances = using
      ? java.usingInstances.includes(obj.instanceUuid)
        ? java.usingInstances
        : [...java.usingInstances, obj.instanceUuid]
      : java.usingInstances.filter((uuid) => uuid !== obj.instanceUuid);
  };
  const onOpen = (obj: { instanceUuid: string }) => updateUsage(obj, true);
  const onStop = (obj: { instanceUuid: string }) => updateUsage(obj, false);
  ctx.instances.subsystem.on("open", onOpen);
  ctx.instances.subsystem.on("exit", onStop);
  ctx.instances.subsystem.on("failure", onStop);
  for (const instance of ctx.instances.subsystem.getInstances()) {
    if (!instance.isStoppedOrBusy()) onOpen({ instanceUuid: instance.instanceUuid });
  }
  ctx.on("dispose", () => {
    ctx.instances.subsystem.off("open", onOpen);
    ctx.instances.subsystem.off("exit", onStop);
    ctx.instances.subsystem.off("failure", onStop);
  });
}
