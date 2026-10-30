import os from "os";
import path from "path";
import { bundledToolPath } from "mcsmanager-common";

const system = os.platform();
const arch = os.arch();
const suffix = system === "win32" ? ".exe" : "";

export const PTY_PATH = bundledToolPath("pty");
export const FRPC_PATH = path.normalize(path.join(process.cwd(), "lib", `frpc_${system}_${arch}${suffix}`));
export const STEAM_CMD_PATH = path.normalize(
  path.join(process.cwd(), "lib", system === "win32" ? "steamcmd.exe" : `steamcmd_${arch}`)
);
export const SYSTEM_TYPE = system;
export const FILENAME_BLACKLIST = ["\\", "/", ".", "'", '"', "?", "*", "<", ">"];
export const WINDOWS_STEAM_CMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
export const IGNORE = "[IGNORE_LOG]";
export const LOCAL_PRESET_LANG_PATH = path.normalize(path.join(process.cwd(), "language"));
export const GOLANG_ZIP_PATH = bundledToolPath("file_zip");
export const SEVEN_ZIP_PATH = bundledToolPath("7z");
export const ZIP_TIMEOUT_SECONDS = 60 * 40;
