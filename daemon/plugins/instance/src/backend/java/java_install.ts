import axios from "axios";
import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { pipeline } from "stream/promises";
import { extract } from "tar";
import type { JavaDownload } from "./msl_java";

/** Locate a runtime in Linux JDK roots, Windows ZIPs or macOS .jdk bundles. */
export async function findJavaExecutable(
  root: string,
  platform: NodeJS.Platform = process.platform,
  depth = 0
): Promise<string | undefined> {
  const direct = await fs.stat(root).catch(() => undefined);
  if (direct?.isFile()) return root;
  if (!direct?.isDirectory()) return;
  const executable = platform === "win32" ? "java.exe" : "java";
  for (const relative of [
    path.join("bin", executable),
    path.join("Contents", "Home", "bin", executable)
  ]) {
    const candidate = path.join(root, relative);
    if ((await fs.stat(candidate).catch(() => undefined))?.isFile()) return candidate;
  }
  if (depth >= 3) return;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = await findJavaExecutable(path.join(root, entry.name), platform, depth + 1);
    if (found) return found;
  }
}

export async function installJavaArchive(options: {
  download: JavaDownload;
  directory: string;
  signal: AbortSignal;
  platform: NodeJS.Platform;
  translate(key: string): string;
  unzip(directory: string, file: string, destination: string): Promise<boolean>;
  progress(value?: number): void;
}) {
  const { download, directory, signal, platform, translate: t } = options;
  const staging = path.join(directory, ".install");
  const extracted = path.join(staging, "runtime");
  const installed = path.join(directory, "runtime");
  const archive = `archive.${download.archive}`;
  const file = path.join(staging, archive);
  const checkCancelled = () => {
    if (signal.aborted) throw new Error(t("TXT_CODE_javaMsl.interrupted"));
  };
  try {
    await fs.remove(staging);
    await fs.ensureDir(extracted);
    checkCancelled();
    const response = await axios.get(download.url, {
      responseType: "stream",
      headers: { "User-Agent": "ElementsPanel" },
      signal,
      timeout: 30000,
      maxRedirects: 10
    });
    const hash = download.sha256 ? createHash("sha256") : undefined;
    const total = Number(response.headers["content-length"]);
    let bytes = 0;
    response.data.on("data", (chunk: Buffer) => {
      hash?.update(chunk);
      bytes += chunk.length;
      options.progress(total > 0 ? Math.min(99, Math.floor((bytes * 100) / total)) : undefined);
    });
    await pipeline(response.data, fs.createWriteStream(file), { signal });
    checkCancelled();
    if (hash && hash.digest("hex").toLowerCase() !== download.sha256!.toLowerCase()) {
      throw new Error(t("TXT_CODE_javaMsl.checksumFailed"));
    }
    if (download.archive === "zip") {
      if (!(await options.unzip(staging, archive, "runtime")))
        throw new Error(t("TXT_CODE_javaMsl.extractFailed"));
    } else {
      let invalidEntry = false;
      const unpack = extract({
        cwd: extracted,
        strict: true,
        filter: (name, entry) => {
          if (!("type" in entry)) return false;
          const relative = name.replace(/\\/g, "/");
          const link = entry.linkpath?.replace(/\\/g, "/");
          const target =
            link &&
            path.posix.normalize(
              entry.type === "Link" ? link : path.posix.join(path.posix.dirname(relative), link)
            );
          if (
            relative.startsWith("/") ||
            /^[a-z]:/i.test(relative) ||
            relative.split("/").includes("..") ||
            (link &&
              (link.startsWith("/") ||
                /^[a-z]:/i.test(link) ||
                target === ".." ||
                target?.startsWith("../")))
          ) {
            invalidEntry = true;
          }
          // Do not throw from tar's asynchronous parser callbacks.
          return !invalidEntry;
        }
      });
      await pipeline(fs.createReadStream(file), unpack, { signal });
      if (invalidEntry) throw new Error(t("TXT_CODE_javaMsl.extractFailed"));
    }
    checkCancelled();
    const executable = await findJavaExecutable(extracted, platform);
    if (!executable) throw new Error(t("TXT_CODE_82c8bca3"));
    const real = await fs.realpath(executable);
    const relative = path.relative(await fs.realpath(extracted), real);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative))
      throw new Error(t("TXT_CODE_javaMsl.extractFailed"));
    if (platform !== "win32") await fs.chmod(real, 0o755);
    const home = path.relative(extracted, path.dirname(path.dirname(executable)));
    checkCancelled();
    await fs.move(extracted, installed);
    return path.join(installed, home);
  } finally {
    await fs.remove(staging);
  }
}
