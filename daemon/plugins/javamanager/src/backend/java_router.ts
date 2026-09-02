import fs from "fs-extra";
import path from "path";
import { extract } from "tar";
import { URL } from "url";
import type { DaemonPluginContext } from "../../../../src/plugin";
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

  protocol.on("java_manager/add", async (routerCtx, data) => {
    const info = new JavaInfo(data.name, Date.now());
    try {
      if (!ctx.files.FileManager.checkFileName(data.name)) {
        throw new Error(t("TXT_CODE_b623b66f"));
      }
      if (javaManager.exists(info.fullname)) throw new Error(t("TXT_CODE_79cf0302"));
      info.path = path.normalize(data.path);
      javaManager.addJava(info);
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/download", async (routerCtx, data) => {
    const info = new JavaInfo(data.name, Date.now(), data.version);
    if (javaManager.exists(info.fullname)) {
      return protocol.responseError(routerCtx, new Error(t("TXT_CODE_79cf0302")));
    }
    protocol.response(routerCtx, true);

    info.downloading = true;
    try {
      javaManager.addJava(info);
      const downloadUrl = await javaManager.getJavaDownloadUrl(info);
      if (!downloadUrl) throw new Error(t("TXT_CODE_4b0f31b4"));

      ctx.logger.info(`Download Java: ${downloadUrl} --> ${info.fullname}`);
      const javaPath = path.join(javaManager.getJavaDataDir(), info.fullname);
      fs.mkdirsSync(javaPath);
      const fileName = path.basename(new URL(downloadUrl).pathname);
      const filePath = path.join(javaPath, fileName);

      await ctx.transfer.downloads.downloadFromUrl(downloadUrl, filePath);
      const java = javaManager.getJava(info.fullname);
      if (!java) return;

      if (fileName.endsWith(".zip")) {
        const fileManager = new ctx.files.FileManager(javaPath, "UTF-8");
        await fileManager.unzip(fileName, ".", "UTF-8");
        const extractDir = path.join(javaPath, path.basename(fileName, ".zip"));
        if (fs.existsSync(extractDir) && (await fs.stat(extractDir)).isDirectory()) {
          for (const file of await fs.readdir(extractDir)) {
            await fs.move(path.join(extractDir, file), path.join(javaPath, file));
          }
          await fs.remove(extractDir);
        }
      } else if (fileName.endsWith(".tar.gz")) {
        await extract({ file: filePath, cwd: javaPath, strip: 1 });
      }

      ctx.logger.info(`Install Env Success: ${info.fullname}`);
      info.downloading = false;
      javaManager.updateJavaInfo(info);
    } catch (error: any) {
      ctx.logger.warn(`Install Env Error: ${error.message}`);
      await javaManager.removeJava(info.fullname);
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("java_manager/using", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(data.instanceId);
      if (!instance) throw new Error(t("TXT_CODE_ef6b54fb"));
      const startCommand = ctx.instances.commandStringToArray(instance.config.startCommand);
      startCommand[0] = "{mcsm_java}";
      instance.parameters({
        java: { id: data.id },
        startCommand: startCommand.join(" ")
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
