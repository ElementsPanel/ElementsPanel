import os from "os";
import { getFileManager, getWindowsDisks } from "./file_service";
import { $t, fileTasks, instances, logger, protocol, settings, transfer } from "./runtime";
import uploadManager from "./upload_manager";
import { checkSafeUrl } from "./url";

/**
 * Every `file/*` protocol event, plus the middleware that gates them.
 *
 * Registered from `apply()`, so all of it — the middleware included — leaves with
 * the plugin. The middleware runs after `plugins/auth`'s, which loads first.
 */
export function registerFileEvents() {
  // Some routers operate router authentication middleware
  protocol().use((event, ctx, data, next) => {
    if (event.startsWith("file/")) {
      const instanceUuid = data.instanceUuid;
      const instance = instances().subsystem.getInstance(instanceUuid);
      if (!instance) {
        return protocol().error(ctx, event, {
          instanceUuid: instanceUuid,
          err: $t("TXT_CODE_file_router.instanceNotExist", { instanceUuid: instanceUuid })
        });
      }

      if (
        [instances().Instance.STATUS_BUSY, instances().Instance.STATUS_STARTING].includes(instance.status()) &&
        !["file/list", "file/status"].includes(event)
      ) {
        return protocol().error(ctx, event, {
          instanceUuid: instanceUuid,
          err: $t("TXT_CODE_bbedcf29")
        });
      }
    }
    next();
  });

  // List the files in the specified instance working directory
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

  // Preview archive contents without extracting the archive
  protocol().on("file/preview", async (ctx, data) => {
    const maxFileTask = settings().config.maxFileTask;
    const instance = instances().subsystem.getInstance(data.instanceUuid);
    let taskStarted = false;
    try {
      if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));
      if (instance.info.fileLock >= maxFileTask) {
        throw new Error(
          $t("TXT_CODE_file_router.unzipLimit", {
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

  // File chmod (only Linux)
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
      const { chmod, targets, deep: rawDeep } = data as {
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

  // Query the status of the file management system
  protocol().on("file/status", async (ctx, data) => {
    try {
      const instance = instances().subsystem.getInstance(data.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));

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

  // Create a new file
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

  // Create a directory
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

  // download a file from url
  protocol().on("file/download_from_url", async (ctx, data) => {
    try {
      const url = data.url;
      const fileName = data.fileName;

      if (!checkSafeUrl(url)) {
        protocol().responseError(ctx, $t("TXT_CODE_3fe1b194"), {
          disablePrint: true
        });
        return;
      }

      const fileManager = getFileManager(data.instanceUuid);
      fileManager.checkPath(fileName);
      const targetPath = fileManager.toAbsolutePath(fileName);

      // Start download in background
      const fallbackUrl = data.fallbackUrl;

      const maxDownloadFromUrlFileCount = settings().config.maxDownloadFromUrlFileCount;
      if (
        maxDownloadFromUrlFileCount > 0 &&
        transfer().downloads.downloadingCount >= maxDownloadFromUrlFileCount
      ) {
        protocol().responseError(ctx, $t("TXT_CODE_821a742e", { count: maxDownloadFromUrlFileCount }), {
          disablePrint: true
        });
        return;
      }

      transfer().downloads.downloadFromUrl(url, targetPath, fallbackUrl).catch((err: any) => {
        logger().error(`Download failed: ${url} -> ${targetPath}`, err);
      });

      protocol().response(ctx, {});
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  // stop download from url
  protocol().on("file/download_stop", (ctx, data) => {
    try {
      const fileManager = getFileManager(data.instanceUuid);
      fileManager.checkPath(data.fileName);
      const targetPath = fileManager.toAbsolutePath(data.fileName);
      const result = transfer().downloads.stop(targetPath);
      protocol().response(ctx, result);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  // copy the file
  protocol().on("file/copy", async (ctx, data) => {
    try {
      // [["a.txt","b.txt"],["cxz","zzz"]]
      const targets = data.targets;
      const fileManager = getFileManager(data.instanceUuid);
      for (const target of targets) {
        fileManager.copy(target[0], target[1]);
      }
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  // move the file
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

  // Delete Files
  protocol().on("file/delete", async (ctx, data) => {
    try {
      const targets = data.targets;
      const fileManager = getFileManager(data.instanceUuid);
      for (const target of targets) {
        const path = fileManager.toAbsolutePath(target);
        const uploadTask = uploadManager.getByPath(path);
        if (uploadTask != undefined) {
          uploadManager.delete(uploadTask.id);
          uploadTask.writer.stop();
        } else {
          // async delete
          fileManager.delete(target);
        }
      }
      protocol().response(ctx, true);
    } catch (error: any) {
      protocol().responseError(ctx, error);
    }
  });

  // edit file
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

  // compress/decompress the file
  protocol().on("file/compress", async (ctx, data) => {
    const maxFileTask = settings().config.maxFileTask;
    try {
      const source = data.source;
      const targets = data.targets;
      const type = data.type;
      const code = data.code;
      const fileManager = getFileManager(data.instanceUuid);
      const instance = instances().subsystem.getInstance(data.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));
      if (instance.info.fileLock >= maxFileTask) {
        throw new Error(
          $t("TXT_CODE_file_router.unzipLimit", {
            maxFileTask: maxFileTask,
            fileLock: instance.info.fileLock
          })
        );
      }

      // Statistics of the number of tasks in a single instance file and the number of tasks in the entire daemon process
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

      // start decompressing or compressing the file
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
