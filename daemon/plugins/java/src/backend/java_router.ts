import path from "path";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { bindJavaCommand } from "../../../../../common/src/java";
import { JavaInfo } from "./java_info";
import type { JavaManager } from "./java_manager";

/** Registers the daemon protocol owned by the Java Manager plugin. */
export function registerJavaManagerRoutes(ctx: DaemonPluginContext, javaManager: JavaManager) {
  const t = ctx.i18n.$t;
  const protocol = ctx.protocol;
  const instances = ctx.instances.subsystem;

  protocol.on("java_manager/list", (routerCtx) => {
    protocol.response(routerCtx, javaManager.list());
  });
  protocol.on("java_manager/catalog", async (routerCtx) => {
    try {
      protocol.response(routerCtx, await javaManager.getAvailableVersions());
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/add", async (routerCtx, data) => {
    try {
      if (!ctx.files.FileManager.checkFileName(data.name)) throw new Error(t("TXT_CODE_b623b66f"));
      const info = new JavaInfo(data.name, Date.now());
      info.path = path.normalize(data.path);
      javaManager.addJava(info);
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/download", async (routerCtx, data) => {
    try {
      // Accept the former source name for clients upgraded independently of nodes.
      if (data.name && !["msl", "zulu"].includes(data.name))
        throw new Error(t("TXT_CODE_javaMsl.invalidVersion"));
      const runtime = await javaManager.startInstall(data.version);
      protocol.response(routerCtx, runtime);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/using", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(data.instanceId);
      if (!instance) throw new Error(t("TXT_CODE_ef6b54fb"));
      await javaManager.getJavaRuntimeCommand(data.id);
      instance.parameters({
        java: { id: data.id },
        startCommand: bindJavaCommand(instance.config.startCommand, "{mcsm_java}")
      });
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/delete", async (routerCtx, data) => {
    try {
      await javaManager.removeJava(data.id);
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });
}
