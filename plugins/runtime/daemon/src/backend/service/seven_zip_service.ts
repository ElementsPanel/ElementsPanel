import { exec } from "child_process";
import { existsSync } from "fs";
import { ensureExecutable } from "mcsmanager-common";
import path from "path";
import { promisify } from "util";
import { SEVEN_ZIP_PATH } from "../const";
import { $t } from "../i18n";
import logger from "./log";

const execPromise = promisify(exec);

export function isZipFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".zip";
}

/** Recognize split ZIP, 7z and RAR names, including z01, 7z.001, part1.rar and r00. */
export function isMultiVolume(filePath: string): boolean {
  const dir = path.dirname(filePath);
  const fullName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".zip") {
    const baseName = path.basename(filePath, ".zip");
    const firstVolumeFile = path.join(dir, baseName + ".z01");
    return existsSync(firstVolumeFile);
  }

  if (ext === ".7z") {
    const baseName = path.basename(filePath, ".7z");
    const firstVolumeFile = path.join(dir, baseName + ".7z.001");
    return existsSync(firstVolumeFile);
  }

  if (ext === ".rar") {
    const baseName = path.basename(filePath, ".rar");

    if (fullName.includes(".part1.rar")) {
      const partBaseName = fullName.replace(".part1.rar", "");
      const secondPartFile = path.join(dir, partBaseName + ".part2.rar");
      return existsSync(secondPartFile);
    }

    const firstVolumeFile = path.join(dir, baseName + ".r00");
    return existsSync(firstVolumeFile);
  }

  return false;
}

export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase().substring(1) || "unknown";
}

let isChecked7zip = false;
export async function check7zipStatus(): Promise<boolean> {
  try {
    if (isChecked7zip) return true;
    if (!existsSync(SEVEN_ZIP_PATH)) return false;
    try {
      ensureExecutable(SEVEN_ZIP_PATH);
    } catch (chmodError: any) {
      logger.warn(
        $t("TXT_CODE_COMMON_FAILED_TO_SET_7ZIP_FILE_PERMISSIONS", { message: chmodError.message })
      );
    }
    const { stdout } = await execPromise(`"${SEVEN_ZIP_PATH}" i`, {
      timeout: 5 * 1000
    });
    if (stdout.includes("7-Zip") && stdout.includes("Copyright")) {
      logger.info(
        $t("TXT_CODE_COMMON_7ZIP_SUCCESSFULLY_LOADED", { info: stdout.split("\n")[1].trim() })
      );
      isChecked7zip = true;
      return true;
    }
    return false;
  } catch (error: any) {
    return false;
  }
}
