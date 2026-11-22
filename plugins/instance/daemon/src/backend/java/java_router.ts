import path from "path";
import type { DaemonPluginContext } from "../../../../../../core/daemon/src/plugin";
import { bindJavaCommand } from "../../../../../../core/common/src/java";
import { JavaInfo } from "./java_info";
import type { JavaManager } from "./java_manager";

export function registerJavaManagerRoutes(
  ctx: DaemonPluginContext,
  javaManager: JavaManager,
  instances = ctx.instances.subsystem
) {
  const t = ctx.i18n.$t;
  const protocol = ctx.protocol;

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
      if (!ctx.files.FileManager.checkFileName(data.name))
        throw new Error(
          t("TXT_CODE_COMMON_THE_NAME_CONTAINS_INVALID_CHARACTERS_PLEASE_MODIFY_THE_NAME")
        );
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
        throw new Error(t("TXT_CODE_JAVA_MSL_INVALID_VERSION"));
      const runtime = await javaManager.startInstall(data.version);
      protocol.response(routerCtx, runtime);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/using", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(data.instanceId);
      if (!instance) throw new Error(t("TXT_CODE_COMMON_INSTANCE_NOT_FOUND"));
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
