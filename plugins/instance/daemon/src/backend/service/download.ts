import path from "path";
import fs from "fs-extra";
import axios from "axios";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import logger from "./log";
import { getCommonHeaders } from "../common/network";

export async function downloadFileToLocalFile(
  url: string,
  localFilePath: string
): Promise<boolean> {
  logger.info(`Download File: ${url} --> ${path.normalize(localFilePath)}`);
  try {
    if (fs.existsSync(localFilePath)) fs.removeSync(localFilePath);
    const response = await axios<Readable>({
      url,
      responseType: "stream",
      timeout: 1000 * 20,
      headers: getCommonHeaders(url),
      maxRedirects: 10
    });
    const writeStream = fs.createWriteStream(path.normalize(localFilePath));
    await pipeline(response.data, writeStream);
    await fs.chmod(localFilePath, 0o777);
    return true;
  } catch (error) {
    await fs.remove(localFilePath).catch(() => {});
    throw error;
  }
}
