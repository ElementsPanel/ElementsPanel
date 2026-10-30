import type { DaemonPluginContext } from "../../../../../../core/daemon/src/plugin";
import { registerJavaManagerRoutes } from "./java_router";
import { JavaManager } from "./java_manager";

export async function registerJavaManager(
  ctx: DaemonPluginContext,
  instances: DaemonPluginContext["instances"]
) {
  const javaManager = new JavaManager({
    defaultJavaDataPath: ctx.settings.config.defaultJavaDataPath,
    translate: ctx.i18n.$t,
    logger: ctx.logger,
    backgroundTasks: ctx.get("backgroundTasks"),
    unzip: (directory, file, destination) =>
      new ctx.files.FileManager(directory, "UTF-8").unzip(file, destination, "UTF-8")
  });
  let disposed = false;
  ctx.on("dispose", () => {
    disposed = true;
    return javaManager.dispose();
  });
  await javaManager.ready;
  if (disposed) return false;
  ctx.set("javaManager", javaManager);
  ctx.features.add("javaManager");
  ctx.features.add("javaManagerMsl");

  const subsystem = instances.subsystem;
  registerJavaManagerRoutes(ctx, javaManager, subsystem);

  const updateUsage = (obj: { instanceUuid: string }, using: boolean) => {
    const config = subsystem.getInstance(obj.instanceUuid)?.config;
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
  subsystem.on("open", onOpen);
  subsystem.on("exit", onStop);
  subsystem.on("failure", onStop);
  for (const instance of subsystem.getInstances()) {
    if (!instance.isStoppedOrBusy()) onOpen({ instanceUuid: instance.instanceUuid });
  }
  ctx.on("dispose", () => {
    subsystem.off("open", onOpen);
    subsystem.off("exit", onStop);
    subsystem.off("failure", onStop);
  });
  return true;
}
