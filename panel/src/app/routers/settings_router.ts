import Router from "@koa/router";
import formidable from "formidable";
import * as fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import FileManager from "../../../../daemon/src/service/system_file";
import { SAVE_DIR_PATH } from "../const";
import SystemConfig from "../entity/setting";
import { ROLE } from "../entity/user";
import { $t, i18next } from "../i18n";
import { speedLimit } from "../middleware/limit";
import permission from "../middleware/permission";
import {
  getFrontendLayoutConfig,
  resetFrontendLayoutConfig,
  setFrontendLayoutConfig
} from "../service/frontend_layout";
import { getRequestGuard as guard } from "../service/request_guard";
import { logger } from "../service/log";
import { operationLogger } from "../service/operation_logger";
import { saveSystemConfig, systemConfig } from "../setting";
import { checkBusinessMode } from "../version";
import { remoteSubsystem } from "../service/remote_access";

const router = new Router({ prefix: "/overview" });

// [Top-level Permission]
// Get panel configuration items
router.get("/setting", permission({ level: ROLE.ADMIN }), async (ctx) => {
  ctx.body = systemConfig;
});

// [Top-level Permission]
// Update panel configuration items
router.put("/setting", permission({ level: ROLE.ADMIN }), async (ctx) => {
  const config = ctx.request.body as Partial<SystemConfig>;
  if (config && systemConfig) {
    // The HTTP server's own fields — port, binding IP, path prefix, SSL, CORS
    // and the reverse proxy — are edited by the "server" plugin, which owns the
    // web server they configure.
    if (config.gzip != null) systemConfig.gzip = config.gzip;
    if (config.maxCompress != null) systemConfig.maxCompress = config.maxCompress;
    if (config.maxDownload != null) systemConfig.maxDownload = config.maxDownload;
    if (config.zipType != null) systemConfig.zipType = config.zipType;
    if (config.forwardType != null) systemConfig.forwardType = Number(config.forwardType);
    if (config.dataPort != null) systemConfig.dataPort = Number(config.dataPort);
    if (config.canFileManager != null) systemConfig.canFileManager = Boolean(config.canFileManager);

    if (config.businessMode != null) systemConfig.businessMode = Boolean(config.businessMode);
    if (config.businessId != null) systemConfig.businessId = String(config.businessId);
    if (config.allowChangeCmd != null) systemConfig.allowChangeCmd = Boolean(config.allowChangeCmd);
    if (config.allowJavaManager != null) systemConfig.allowJavaManager = Boolean(config.allowJavaManager);
    if (config.registerCode != null) systemConfig.registerCode = String(config.registerCode);
    if (config.panelId != null) systemConfig.panelId = String(config.panelId);

    if (config.language != null) {
      logger.warn($t("TXT_CODE_e29a9317"), config.language);
      systemConfig.language = String(config.language);
      await i18next.changeLanguage(systemConfig.language.toLowerCase());
      remoteSubsystem().changeDaemonLanguage(systemConfig.language);
    }

    operationLogger.log("system_config_change", {
      operator_ip: ctx.ip,
      operator_name: guard().identify(ctx).userName
    });

    saveSystemConfig(systemConfig);
    checkBusinessMode();
    ctx.body = "OK";
    return;
  }
  ctx.body = new Error($t("TXT_CODE_e4d6cc20"));
});

// [Public router]
router.get("/layout", async (ctx) => {
  ctx.body = getFrontendLayoutConfig();
});

// [Top-level Permission]
// Set frontend layout
router.post("/layout", permission({ level: ROLE.ADMIN }), async (ctx) => {
  const config = ctx.request.body;
  setFrontendLayoutConfig(config);
  ctx.body = true;
});

// [Top-level Permission]
// Reset frontend layout
router.delete("/layout", permission({ level: ROLE.ADMIN }), async (ctx) => {
  resetFrontendLayoutConfig();
  ctx.body = true;
});

// [Top-level Permission]
// Upload file to asserts directory, only administrator can upload
router.post("/upload_assets", permission({ level: ROLE.ADMIN }), async (ctx) => {
  let files = ctx.request.files?.file;
  let tmpFile: formidable.File | undefined;
  if (Array.isArray(files)) {
    tmpFile = files[0];
  } else {
    tmpFile = files;
  }
  try {
    if (!tmpFile) throw new Error($t("TXT_CODE_e4d6cc20"));
    if (!tmpFile.filepath || !fs.existsSync(tmpFile.filepath))
      throw new Error($t("TXT_CODE_1a499109"));
    const newFileName = v4() + path.extname(tmpFile.originalFilename || "");
    if (!FileManager.checkFileName(newFileName))
      throw new Error("Access denied: Malformed file name");
    const saveDirPath = path.join(process.cwd(), SAVE_DIR_PATH);
    if (!fs.existsSync(saveDirPath)) fs.mkdirsSync(saveDirPath);
    await fs.move(tmpFile.filepath, path.join(saveDirPath, newFileName));
    ctx.body = newFileName;
  } finally {
    if (Array.isArray(files)) {
      files.forEach((v) => {
        if (v?.filepath) fs.remove(v.filepath, () => { });
      });
    } else {
      if (tmpFile?.filepath) fs.remove(tmpFile.filepath, () => { });
    }
  }
});

router.post(
  "/refresh_business_mode",
  speedLimit(5),
  permission({ level: ROLE.ADMIN }),
  async (ctx) => {
    await checkBusinessMode();
    ctx.body = "OK";
  }
);

export default router;
