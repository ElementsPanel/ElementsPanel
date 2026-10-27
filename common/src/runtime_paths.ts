import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Set by the npm worker before any application module is loaded. */
export function isPackagedRuntime(): boolean {
  return Boolean(process.env.EPANEL_PACKAGE_ROOT);
}

/** Code and bundled assets belong to the package; cwd always belongs to the user. */
export function packagePath(...parts: string[]): string {
  return path.resolve(process.env.EPANEL_PACKAGE_ROOT || process.cwd(), ...parts);
}

export function isPackagePlugin(directory: string): boolean {
  if (!isPackagedRuntime()) return false;
  const relative = path.relative(packagePath("plugins"), path.resolve(directory));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function bundledToolPath(name: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const suffix = platform === "win32" ? ".exe" : "";
  const filename = `${name}_${platform}_${arch}${suffix}`;
  const primary = packagePath("lib", filename);
  // Zip-Tools names its Intel macOS binary "amd64", while Node reports "x64".
  if (!fs.existsSync(primary) && name === "file_zip" && platform === "darwin" && arch === "x64") {
    const alternate = packagePath("lib", "file_zip_darwin_amd64");
    if (fs.existsSync(alternate)) return alternate;
  }
  return primary;
}

/** Published binaries already carry executable permissions, including in read-only installs. */
export function ensureExecutable(filename: string): void {
  if (os.platform() === "win32") return;
  try {
    fs.accessSync(filename, fs.constants.X_OK);
  } catch {
    fs.chmodSync(filename, 0o755);
  }
}
