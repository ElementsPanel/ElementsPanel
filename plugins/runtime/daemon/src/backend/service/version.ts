import { $t } from "../i18n";
import * as fs from "fs-extra";
import { GlobalVariable, packagePath } from "mcsmanager-common";
import logger from "./log";

const PACKAGE_JSON = packagePath("package.json");

export function initVersionManager() {
  try {
    GlobalVariable.set("version", "Unknown");
    if (fs.existsSync(PACKAGE_JSON)) {
      const data: any = JSON.parse(fs.readFileSync(PACKAGE_JSON, { encoding: "utf-8" }));
      if (data.version) {
        GlobalVariable.set("version", data.version);
      }
    }
  } catch (error: any) {
    logger.error($t("TXT_CODE_VERSION_VERSION_DETECT_ERR"), error);
  }
}

export function getVersion() {
  return GlobalVariable.get("version", "Unknown");
}
