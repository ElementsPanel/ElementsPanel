import os from "os";
import { getFileManager, getWindowsDisks } from "./file_service";
import { $t, fileTasks, instances, logger, protocol, settings, transfer } from "./runtime";
import uploadManager from "./upload_manager";
import { checkSafeUrl } from "./url";

/** Register file protocol handlers and their access middleware in the plugin scope, after auth. */
export function registerFileEvents() {
  protocol().use((event, ctx, data, next) => {
    if (event.startsWith("file/")) {
      const instanceUuid = data.instanceUuid;
      const instance = instances().subsystem.getInstance(instanceUuid);
      if (!instance) {
        return protocol().error(ctx, event, {
          instanceUuid: instanceUuid,
          err: $t("TXT_CODE_FILE_ROUTER_INSTANCE_NOT_EXIST", { instanceUuid: instanceUuid })
        });
      }

      if (
        [instances().Instance.STATUS_BUSY, instances().Instance.STATUS_STARTING].includes(
          instance.status()
        ) &&
        !["file/list", "file/status"].includes(event)
      ) {
        return protocol().error(ctx, event, {
          instanceUuid: instanceUuid,
          err: $t("TXT_CODE_INSTANCE_STATE_BLOCKS_FILE_EDITS")
        });
      }
    }
    next();
  });

  protocol().on("file/list", async (ctx, data) => {
    try {
      const fileManager = getFileManager(data.instanceUuid);
      const { page, pageSize, target, fileName } = data;
      fileManager.cd(target);
      const overview = await fileManager.list(page, pageSize, fileName);
      protocol().response(ctx, overview);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/preview", async (ctx, data) => {
    const maxFileTask = settings().config.maxFileTask;
    const instance = instances().subsystem.getInstance(data.instanceUuid);
    let taskStarted = false;
    try {
      if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
      if (instance.info.fileLock >= maxFileTask) {
        throw new Error(
          $t("TXT_CODE_FILE_ROUTER_UNZIP_LIMIT", {
            maxFileTask,
            fileLock: instance.info.fileLock
          })
        );
      }

      const fileManager = getFileManager(data.instanceUuid);
      instance.info.fileLock++;
      fileTasks.count++;
      taskStarted = true;
      const entries = await fileManager.previewArchive(data.target, data.code);
      protocol().response(ctx, { items: entries, total: entries.length });
    } catch (error: any) {
      protocol().responseError(ctx, error);
    } finally {
      if (instance && taskStarted) {
        instance.info.fileLock = Math.max(0, instance.info.fileLock - 1);
        fileTasks.count = Math.max(0, fileTasks.count - 1);
      }
    }
  });

  protocol().on("file/chmod", async (ctx, data) => {
    try {
      const fileManager = getFileManager(data.instanceUuid);
      const { chmod, target, deep } = data;
      await fileManager.chmod(target, chmod, deep);
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/chmod_batch", async (ctx, data) => {
    try {
      const fileManager = getFileManager(data.instanceUuid);
      const {
        chmod,
        targets,
        deep: rawDeep
      } = data as {
        chmod: number;
        deep?: boolean;
        targets: string[];
      };
      const deep = Boolean(rawDeep);
      const results: { target: string; success: boolean; error?: string }[] = [];
      let success = 0;
      let failed = 0;

      for (const target of targets || []) {
        const currentTarget = String(target);
        try {
          await fileManager.chmod(currentTarget, chmod, deep);
          success += 1;
          results.push({
            target: currentTarget,
            success: true
          });
        } catch (error: any) {
          failed += 1;
          results.push({
            target: currentTarget,
            success: false,
            error: error?.message || String(error)
          });
        }
      }

      protocol().response(ctx, {
        success,
        failed,
        total: results.length,
        results
      });
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/status", async (ctx, data) => {
    try {
      const instance = instances().subsystem.getInstance(data.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));

      const downloads = transfer().downloads;
      const downloadTasks = [];
      if (downloads.task) {
        downloadTasks.push({
          path: downloads.task.path,
          total: downloads.task.total,
          current: downloads.task.current,
          status: downloads.task.status,
          error: downloads.task.error
        });
      }

      protocol().response(ctx, {
        instanceFileTask: instance.info.fileLock ?? 0,
        globalFileTask: fileTasks.count ?? 0,
        downloadFileFromURLTask: downloads.downloadingCount,
        downloadTasks,
        platform: os.platform(),
        isGlobalInstance: data.instanceUuid === instances().subsystem.GLOBAL_INSTANCE_UUID,
        disks: getWindowsDisks()
      });
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/create-text", async (ctx, data) => {
    try {
      if (
        typeof data.target !== "string" ||
        !data.target ||
        data.target.length > 1024 ||
        typeof data.text !== "string" ||
        Buffer.byteLength(data.text, "utf8") > 64 * 1024 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(data.text)
      )
        throw new Error("Invalid text file request");
      const result = await getFileManager(data.instanceUuid).createTextFile(data.target, data.text);
      protocol().response(ctx, result);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/remove-file", async (ctx, data) => {
    try {
      if (typeof data.target !== "string" || !data.target || data.target.length > 1024)
        throw new Error("Invalid file request");
      const result = await getFileManager(data.instanceUuid).removeFile(data.target);
      protocol().response(ctx, result);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/touch", (ctx, data) => {
    try {
      const target = data.target;
      const fileManager = getFileManager(data.instanceUuid);
      fileManager.newFile(target);
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/mkdir", (ctx, data) => {
    try {
      const target = data.target;
      const fileManager = getFileManager(data.instanceUuid);
      fileManager.mkdir(target);
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/download_from_url", async (ctx, data) => {
    try {
      const url = data.url;
      const fileName = data.fileName;

      if (!checkSafeUrl(url) || (data.fallbackUrl && !checkSafeUrl(data.fallbackUrl))) {
        protocol().responseError(ctx, $t("TXT_CODE_COMMON_THIS_URL_IS_INSECURE_PLEASE_ENTER_A_URL_WITH_A_DOMAIN_NAME_THAT_IS_EXPOSED_ON"), {
          disablePrint: true
        });
        return;
      }

      const fileManager = getFileManager(data.instanceUuid);
      if (!fileManager.checkPath(fileName)) throw new Error("Access denied: Invalid destination");
      const targetPath = fileManager.toAbsolutePath(fileName);

      const fallbackUrl = data.fallbackUrl;

      const maxDownloadFromUrlFileCount = settings().config.maxDownloadFromUrlFileCount;
      if (
        (data.ifIdle === true && transfer().downloads.downloadingCount > 0) ||
        (maxDownloadFromUrlFileCount > 0 &&
          transfer().downloads.downloadingCount >= maxDownloadFromUrlFileCount)
      ) {
        protocol().responseError(
          ctx,
          $t("TXT_CODE_COMMON_ONLY_HAVE_CONCURRENT_DOWNLOAD_TASKS", {
            count: data.ifIdle === true ? 1 : maxDownloadFromUrlFileCount
          }),
          {
            disablePrint: true
          }
        );
        return;
      }

      transfer()
        .downloads.downloadFromUrl(url, targetPath, fallbackUrl)
        .catch((err: any) => {
          logger().error(`Download failed: ${url} -> ${targetPath}`, err);
        });

      protocol().response(ctx, {});
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/download_stop", (ctx, data) => {
    try {
      const fileManager = getFileManager(data.instanceUuid);
      if (!fileManager.checkPath(data.fileName))
        throw new Error("Access denied: Invalid destination");
      const targetPath = fileManager.toAbsolutePath(data.fileName);
      const result = transfer().downloads.stop(targetPath);
      protocol().response(ctx, result);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/copy", async (ctx, data) => {
    try {
      // [["a.txt","b.txt"],["cxz","zzz"]]
      const targets = data.targets;
      const fileManager = getFileManager(data.instanceUuid);
      for (const target of targets) {
        await fileManager.copy(target[0], target[1]);
      }
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/move", async (ctx, data) => {
    try {
      // [["a.txt","b.txt"],["cxz","zzz"]]
      const targets = data.targets;
      const fileManager = getFileManager(data.instanceUuid);
      for (const target of targets) {
        await fileManager.move(target[0], target[1]);
      }
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/delete", async (ctx, data) => {
    try {
      const targets = data.targets;
      const fileManager = getFileManager(data.instanceUuid);
      for (const target of targets) {
        const path = fileManager.toAbsolutePath(target);
        const uploadTask = uploadManager.getByPath(path);
        if (uploadTask != undefined) {
          uploadManager.delete(uploadTask.id);
          await uploadTask.writer.stop();
        } else {
          await fileManager.delete(target);
        }
      }
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/edit", async (ctx, data) => {
    try {
      const target = data.target;
      const text = data.text;
      const fileManager = getFileManager(data.instanceUuid);
      const result = await fileManager.edit(target, text);
      protocol().response(ctx, result ? result : true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  protocol().on("file/compress", async (ctx, data) => {
    const maxFileTask = settings().config.maxFileTask;
    try {
      const source = data.source;
      const targets = data.targets;
      const type = data.type;
      const code = data.code;
      const fileManager = getFileManager(data.instanceUuid);
      const instance = instances().subsystem.getInstance(data.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
      if (instance.info.fileLock >= maxFileTask) {
        throw new Error(
          $t("TXT_CODE_FILE_ROUTER_UNZIP_LIMIT", {
            maxFileTask: maxFileTask,
            fileLock: instance.info.fileLock
          })
        );
      }

      function fileTaskStart() {
        if (instance) {
          instance.info.fileLock++;
          fileTasks.count++;
        }
      }

      function fileTaskEnd() {
        if (instance) {
          instance.info.fileLock--;
          fileTasks.count--;
        }
      }

      fileTaskStart();
      try {
        if (type === 1) {
          await fileManager.zip(source, targets, code);
        } else {
          await fileManager.unzip(source, targets, code);
        }
        protocol().response(ctx, true);
      } catch (error: any) {
        throw error;
      } finally {
        fileTaskEnd();
      }
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });
}
