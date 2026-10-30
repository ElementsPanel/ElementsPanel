import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginDiscoveryRoot } from "./plugin_manifest";
// @ts-ignore Shared source layout is also consumed by the Node build tools.
import { sourcePlugins } from "../../../scripts/workspace-layout.cjs";

/** Set by the npm worker before any application module is loaded. */
export function isPackagedRuntime(): boolean {
  return Boolean(process.env.EPANEL_PACKAGE_ROOT);
}

/** Code and bundled assets belong to the package; cwd always belongs to the user. */
export function packagePath(...parts: string[]): string {
  return path.resolve(
    process.env.EPANEL_PACKAGE_ROOT || process.env.EPANEL_SOURCE_ROOT || process.cwd(),
    ...parts
  );
}

function npmPluginRoots(side?: "panel" | "daemon"): PluginDiscoveryRoot[] {
  // The same resolver is used by the CLI before the bundled application starts.
  // A development checkout keeps it in the repository above core/<side>,
  // so project-installed npm plugins work there as well.
  const runtimeRequire = eval("require") as NodeRequire;
  const resolver = isPackagedRuntime()
    ? packagePath("runtime/npm-plugins.cjs")
    : path.resolve(packagePath(), "../..", "scripts", "runtime", "npm-plugins.cjs");
  // A development process may run from a fixture directory without a runtime
  // package; there is nothing to resolve in that case.
  if (!fs.existsSync(path.join(packagePath(), "package.json"))) return [];
  if (!isPackagedRuntime() && !fs.existsSync(resolver)) return [];
  const { resolveNpmPlugins } = runtimeRequire(resolver);
  return resolveNpmPlugins(packagePath(), side, { skipInvalid: true }).map((record: any) => ({
    directory: record.directory,
    packageRoot: record.packageRoot,
    packageName: record.name,
    npmSource: record.source,
    ...(record.folder ? { folder: record.folder } : {}),
    // Built-in packages are part of the runtime's default configuration. A
    // project dependency is installed but remains dormant until the user
    // enables it through the plugin configuration service.
    defaultEnabled: record.defaultEnabled !== false
  }));
}

export function packagePluginRoots(side: "panel" | "daemon"): PluginDiscoveryRoot[] {
  const sourceCheckout =
    process.env.EPANEL_SOURCE_ROOT || path.basename(path.dirname(packagePath())) === "core";
  const roots: PluginDiscoveryRoot[] = isPackagedRuntime()
    ? []
    : !sourceCheckout
    ? [{ directory: packagePath("plugins"), defaultEnabled: true }]
    : sourcePlugins(side, path.resolve(packagePath(), "../..")).map(
        (plugin: { directory: string; folder: string }) => ({
          directory: plugin.directory,
          folder: plugin.folder,
          defaultEnabled: true
        })
      );
  // Project-installed npm plugins load in development too: they are dependencies
  // of the development project, not of the published runtime package.
  roots.push(...npmPluginRoots(side));
  return roots;
}

export function isPackagePlugin(directory: string): boolean {
  return npmPluginRoots().some((root) => {
    const relative = path.relative(root.directory, path.resolve(directory));
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    );
  });
}

export function bundledToolPath(name: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const suffix = platform === "win32" ? ".exe" : "";
  const filename = `${name}_${platform}_${arch}${suffix}`;
  // Published daemon packages download native tools into the installation's
  // writable lib directory on first start. Development checkouts use the same
  // repository-local sibling of data and logs.
  const root = path.resolve(process.cwd(), "lib");
  const primary = path.join(root, filename);
  // Zip-Tools names its Intel macOS binary "amd64", while Node reports "x64".
  if (!fs.existsSync(primary) && name === "file_zip" && platform === "darwin" && arch === "x64") {
    const alternate = path.join(root, "file_zip_darwin_amd64");
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
