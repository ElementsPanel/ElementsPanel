import fs from "fs-extra";
import path from "path";
import type { MinecraftInstallOptions } from "../../../../../common/src/minecraft";
import { javaExecutableCommand } from "../../../../../common/src/java";

type Translate = (key: string) => string;

export function validateMinecraftInstall(
  options: MinecraftInstallOptions,
  targetLink: string,
  $t: Translate,
  platform: NodeJS.Platform = process.platform,
  arch = process.arch
): MinecraftInstallOptions {
  const invalid = () => new Error($t("TXT_CODE_minecraft.invalidDownload"));
  if (
    !options ||
    !["jar", "forge", "neoforge", "bedrock"].includes(options.kind) ||
    typeof options.server !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(options.server) ||
    typeof options.version !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/.test(options.version) ||
    (options.sha256 != null &&
      (typeof options.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(options.sha256))) ||
    (options.javaPath != null &&
      (typeof options.javaPath !== "string" || /["\r\n\0]/.test(options.javaPath)))
  )
    throw invalid();
  const url = new URL(targetLink);
  if (url.protocol !== "https:" || url.username || url.password) throw invalid();
  if ((options.kind === "forge" || options.kind === "neoforge") && options.server !== options.kind)
    throw invalid();
  if (options.kind === "bedrock") {
    const targetPlatform = options.version.startsWith("win-")
      ? "win32"
      : options.version.startsWith("linux-")
      ? "linux"
      : "";
    if (
      options.server !== "bedrock-server" ||
      !targetPlatform ||
      targetPlatform !== platform ||
      arch !== "x64"
    ) {
      throw new Error($t("TXT_CODE_minecraft.platformMismatch"));
    }
  }
  return { ...options, javaPath: options.javaPath?.trim() || "java" };
}

export function minecraftFileName(options: MinecraftInstallOptions) {
  if (options.kind === "bedrock") return "mcsm_install_package.zip";
  return options.kind === "jar" ? "server.jar" : "server-installer.jar";
}

export function minecraftInstallerCommand(options: MinecraftInstallOptions) {
  return `${javaExecutableCommand(options.javaPath)} -jar server-installer.jar --installServer`;
}

/** Resolve only files actually produced by this installation. */
export async function minecraftStartCommand(
  cwd: string,
  options: MinecraftInstallOptions,
  $t: Translate,
  platform: NodeJS.Platform = process.platform
) {
  const missingFiles = () => new Error($t("TXT_CODE_minecraft.missingFiles"));
  if (options.kind === "bedrock") {
    const executable = platform === "win32" ? "bedrock_server.exe" : "bedrock_server";
    if (!(await fs.pathExists(path.join(cwd, executable)))) throw missingFiles();
    if (platform === "win32") return ".\\bedrock_server.exe";
    await fs.chmod(path.join(cwd, executable), 0o755);
    return "env LD_LIBRARY_PATH=. ./bedrock_server";
  }

  const java = javaExecutableCommand(options.javaPath);
  if (options.kind === "jar") {
    if (!(await fs.pathExists(path.join(cwd, "server.jar")))) throw missingFiles();
    const noGui = !["bungeecord", "velocity", "travertine", "lightfall", "nukkitx"].includes(
      options.server
    );
    return `${java} -jar server.jar${noGui ? " nogui" : ""}`;
  }

  const libraries =
    options.kind === "forge"
      ? ["libraries/net/minecraftforge/forge"]
      : ["libraries/net/neoforged/neoforge", "libraries/net/neoforged/forge"];
  const argsFile = platform === "win32" ? "win_args.txt" : "unix_args.txt";
  const candidates: string[] = [];
  for (const library of libraries) {
    if (!(await fs.pathExists(path.join(cwd, library)))) continue;
    const versions = await fs.readdir(path.join(cwd, library));
    for (const version of versions) {
      const relative = `${library}/${version}/${argsFile}`;
      if (await fs.pathExists(path.join(cwd, relative))) candidates.push(relative);
    }
  }
  if (candidates.length === 1) {
    const jvmArgs = (await fs.pathExists(path.join(cwd, "user_jvm_args.txt")))
      ? " @user_jvm_args.txt"
      : "";
    return `${java}${jvmArgs} "@${candidates[0]}" nogui`;
  }

  // Forge before 1.17 produces an executable JAR instead of argument files.
  const jars = (await fs.readdir(cwd)).filter(
    (name) => /^forge-.*\.jar$/i.test(name) && !/installer/i.test(name)
  );
  if (options.kind === "forge" && jars.length === 1) return `${java} -jar "${jars[0]}" nogui`;
  throw missingFiles();
}
