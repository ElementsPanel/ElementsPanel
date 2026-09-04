import * as fs from "fs-extra";
import { GlobalVariable } from "mcsmanager-common";
import path from "path";
import { logger } from "./service/log";

interface IPackageInfo {
  name: string;
  version: string;
  daemonVersion: string;
  description: string;
}
const PACKAGE_JSON = "package.json";
const VERSION_LOG_TEXT_NAME = "current-version.txt";

let currentVersion = "";

export function initVersionManager() {
  try {
    GlobalVariable.set("lastLaunchedVersion", 100);
    GlobalVariable.set("version", "Unknown");
    if (fs.existsSync(PACKAGE_JSON)) {
      const data: IPackageInfo = JSON.parse(fs.readFileSync(PACKAGE_JSON, { encoding: "utf-8" }));
      if (data.version) {
        GlobalVariable.set("version", data.version);
        currentVersion = String(data.version);
      }
      GlobalVariable.set("specifiedDaemonVersion", data.daemonVersion ?? "1.0.0");
    }
  } catch (error: any) {
    logger.error("Version Check failure:", error);
  }

  const versionLogPath = path.join(process.cwd(), "data", VERSION_LOG_TEXT_NAME);
  if (currentVersion && fs.existsSync(versionLogPath)) {
    const LastLaunchedVersion = fs.readFileSync(versionLogPath, "utf8");
    const lastVersionNumber = Number(LastLaunchedVersion.split(".").slice(0, 2).join(""));

    if (LastLaunchedVersion && LastLaunchedVersion != currentVersion && !isNaN(lastVersionNumber)) {
      logger.warn(`Version changed from ${LastLaunchedVersion} to ${currentVersion}`);
      GlobalVariable.set("lastLaunchedVersion", lastVersionNumber);
      GlobalVariable.set("versionChange", currentVersion);

    }
  }
  fs.ensureDirSync(path.dirname(versionLogPath));
  fs.writeFileSync(versionLogPath, currentVersion, "utf8");
}

export function getVersion(): string {
  return GlobalVariable.get("version", "Unknown");
}

export function hasVersionChanged(): boolean {
  return GlobalVariable.get("versionChange") || false;
}

export function specifiedDaemonVersion() {
  try {
    const data: any = JSON.parse(fs.readFileSync(PACKAGE_JSON, { encoding: "utf-8" }));
    return data.daemonVersion ?? "1.0.0";
  } catch (error: any) {
    return "1.0.0";
  }
}
