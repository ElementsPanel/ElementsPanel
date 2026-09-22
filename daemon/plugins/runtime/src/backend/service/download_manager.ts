import axios from "axios";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";
import { pipeline } from "stream/promises";
import { setTimeout as delay } from "timers/promises";
import { Throttle } from "stream-throttle";
import { globalConfiguration } from "../entity/config";
import { getCommonHeaders } from "../common/network";
import { publicDownloadRequestOptions } from "./public_download";

interface DownloadTask {
  path: string;
  total: number;
  current: number;
  status: number;
  error?: string;
}

class DownloadManager {
  private controller: AbortController | null = null;
  private cleanupTimer?: NodeJS.Timeout;
  public task: DownloadTask | null = null;

  public get downloadingCount() {
    return this.controller ? 1 : 0;
  }

  public async downloadFromUrl(
    url: string,
    targetPath: string,
    fallbackUrl?: string
  ): Promise<void> {
    this.stop();
    const controller = new AbortController();
    const task: DownloadTask = { path: targetPath, total: 0, current: 0, status: 0 };
    this.controller = controller;
    this.task = task;
    // Each attempt owns its staging file. Cancelling an old task cannot delete a
    // replacement download or a file that existed before the download started.
    const temporary = path.join(
      path.dirname(targetPath),
      `.${path.basename(targetPath)}.${randomUUID()}.part`
    );
    try {
      await fs.ensureDir(path.dirname(targetPath));
      const sources = fallbackUrl ? [url, fallbackUrl] : [url];
      for (let index = 0; index < sources.length; index++) {
        try {
          const response = await this.requestWithRetry(sources[index], controller);
          const stream = response.data;
          task.total = Number(response.headers["content-length"]) || 0;
          task.current = 0;
          stream.on("data", (chunk: Buffer) => {
            task.current += chunk.length;
          });
          const writer = fs.createWriteStream(temporary);
          const speedLimit = globalConfiguration.config.uploadSpeedRate;
          if (speedLimit > 0) {
            await pipeline(stream, new Throttle({ rate: speedLimit * 64 * 1024 }), writer, {
              signal: controller.signal
            });
          } else {
            await pipeline(stream, writer, { signal: controller.signal });
          }
          controller.signal.throwIfAborted();
          await fs.rename(temporary, targetPath);
          task.status = 1;
          return;
        } catch (error) {
          if (controller.signal.aborted || index === sources.length - 1) throw error;
        }
      }
    } catch (error: any) {
      task.status = 2;
      task.error = error.message;
      throw error;
    } finally {
      await fs.remove(temporary).catch(() => {});
      if (this.controller === controller) this.controller = null;
      if (this.task === task) {
        this.cleanupTimer = setTimeout(
          () => {
            if (this.task === task) this.task = null;
          },
          task.status === 1 ? 5000 : 10000
        );
        this.cleanupTimer.unref();
      }
    }
  }

  public stop(targetPath?: string) {
    if (targetPath && this.task?.path !== targetPath) return false;
    const running = this.controller !== null;
    this.controller?.abort();
    this.controller = null;
    this.task = null;
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;
    return running;
  }

  private async requestWithRetry(
    url: string,
    controller: AbortController,
    retries = 2
  ): Promise<any> {
    try {
      return await axios({
        ...publicDownloadRequestOptions(url),
        method: "get",
        url,
        responseType: "stream",
        timeout: 60000,
        headers: getCommonHeaders(url),
        maxRedirects: 10,
        signal: controller.signal
      });
    } catch (err: any) {
      err.response?.data?.destroy?.();
      if (controller.signal.aborted) throw err;
      const isNetworkError =
        !err.response && ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(err.code);
      const isRetryableStatus = [500, 502, 503, 504].includes(err.response?.status);
      if (retries > 0 && (isNetworkError || isRetryableStatus)) {
        await delay(2000, undefined, { signal: controller.signal });
        return await this.requestWithRetry(url, controller, retries - 1);
      }
      if (err.response?.status === 403) {
        throw new Error(
          `Access denied (403) for ${url}. This might be a premium plugin or Cloudflare protection.`
        );
      }
      throw err;
    }
  }
}

export default new DownloadManager();
