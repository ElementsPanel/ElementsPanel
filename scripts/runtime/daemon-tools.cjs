const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const sources = [
  ["file_zip", "linux", "arm64", "file_zip_linux_arm64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/file_zip_linux_arm64"],
  ["file_zip", "linux", "x64", "file_zip_linux_x64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/file_zip_linux_x64"],
  ["file_zip", "win32", "x64", "file_zip_win32_x64.exe", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/file_zip_win32_x64.exe"],
  ["file_zip", "darwin", "arm64", "file_zip_darwin_arm64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/file_zip_darwin_arm64"],
  ["file_zip", "darwin", "x64", "file_zip_darwin_amd64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/file_zip_darwin_amd64"],
  ["7z", "linux", "arm64", "7z_linux_arm64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_linux_arm64"],
  ["7z", "linux", "x64", "7z_linux_x64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_linux_x64"],
  ["7z", "win32", "arm64", "7z_win32_arm64.exe", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_win32_arm64.exe"],
  ["7z", "win32", "x64", "7z_win32_x64.exe", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_win32_x64.exe"],
  ["7z", "darwin", "arm64", "7z_darwin_arm64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_darwin_arm64"],
  ["7z", "darwin", "x64", "7z_darwin_x64", "https://github.com/MCSManager/Zip-Tools/releases/latest/download/7z_darwin_x64"],
  ["pty", "linux", "arm64", "pty_linux_arm64", "https://github.com/MCSManager/PTY/releases/download/latest/pty_linux_arm64"],
  ["pty", "linux", "loong64", "pty_linux_loong64", "https://github.com/MCSManager/PTY/releases/download/latest/pty_linux_loong64"],
  ["pty", "linux", "x64", "pty_linux_x64", "https://github.com/MCSManager/PTY/releases/download/latest/pty_linux_x64"],
  ["pty", "win32", "x64", "pty_win32_x64.exe", "https://github.com/MCSManager/PTY/releases/download/latest/pty_win32_x64.exe"],
  ["pty", "darwin", "arm64", "pty_darwin_arm64", "https://github.com/MCSManager/PTY/releases/download/latest/pty_darwin_arm64"],
  ["pty", "darwin", "x64", "pty_darwin_x64", "https://github.com/MCSManager/PTY/releases/download/latest/pty_darwin_x64"]
].map(([name, platform, arch, filename, url]) => ({ name, platform, arch, filename, url }));

const requiredTools = ["file_zip", "pty", "7z"];

function toolSpec(name, platform = process.platform, arch = process.arch) {
  return sources.find((item) => item.name === name && item.platform === platform && item.arch === arch);
}

function toolPath(directory, name, platform = process.platform, arch = process.arch) {
  const spec = toolSpec(name, platform, arch);
  return spec ? path.join(directory, "lib", spec.filename) : undefined;
}

function downloadFile(url, target, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`Too many redirects while downloading ${url}.`));
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const temporary = `${target}.download-${process.pid}-${Date.now()}`;
    let settled = false;
    const cleanup = () => fs.rm(temporary, { force: true }, () => {});
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const request = client.get(url, { headers: { "User-Agent": "ElementsPanel daemon" } }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).href, target, redirects + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        fail(new Error(`Download failed (${status}) for ${url}.`));
        return;
      }
      const output = fs.createWriteStream(temporary, { flags: "wx" });
      output.on("error", fail);
      response.on("error", fail);
      output.once("finish", () => {
        output.close(() => {
          if (settled) return;
          fs.chmod(temporary, process.platform === "win32" ? 0o666 : 0o755, (chmodError) => {
            if (chmodError) return fail(chmodError);
            fs.rename(temporary, target, (renameError) => {
              if (renameError) return fail(renameError);
              settled = true;
              resolve();
            });
          });
        });
      });
      response.pipe(output);
    });
    request.on("error", fail);
  });
}

function usable(filename) {
  try {
    return fs.statSync(filename).isFile() && fs.statSync(filename).size > 0;
  } catch {
    return false;
  }
}

async function ensureRuntimeTools(directory, options = {}) {
  const targetDirectory = path.join(directory, "lib");
  fs.mkdirSync(targetDirectory, { recursive: true });
  const download = options.download || downloadFile;
  for (const name of requiredTools) {
    const spec = toolSpec(name, options.platform || process.platform, options.arch || process.arch);
    if (!spec) {
      throw new Error(
        `No daemon binary download is available for ${name} on ${options.platform || process.platform}/${options.arch || process.arch}.`
      );
    }
    const target = path.join(targetDirectory, spec.filename);
    if (usable(target)) continue;
    fs.rmSync(target, { force: true });
    options.onDownload?.(spec);
    await download(spec.url, target);
    if (!usable(target)) throw new Error(`Downloaded daemon binary is empty: ${spec.filename}.`);
  }
  return targetDirectory;
}

module.exports = { requiredTools, sources, toolSpec, toolPath, downloadFile, ensureRuntimeTools };
