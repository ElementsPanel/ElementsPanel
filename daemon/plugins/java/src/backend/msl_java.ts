import axios from "axios";
import os from "os";
import type { JavaCatalog } from "../../../../../common/src/java";

export interface JavaDownload {
  url: string;
  sha256?: string;
  archive: "zip" | "tar.gz";
}

export class MslJavaSource {
  private catalog?: { expires: number; data: JavaCatalog };
  private readonly controller = new AbortController();

  constructor(
    private readonly t: (key: string) => string,
    private readonly platform = os.platform(),
    private readonly arch = os.arch()
  ) {}

  private target(): Omit<JavaCatalog, "versions"> {
    const platform =
      this.platform === "win32"
        ? "windows"
        : this.platform === "darwin"
        ? "mac"
        : this.platform === "linux"
        ? "linux"
        : undefined;
    if (!platform || (this.arch !== "x64" && this.arch !== "arm64")) {
      throw new Error(this.t("TXT_CODE_javaMsl.unsupportedPlatform"));
    }
    return { platform, arch: this.arch };
  }

  private async request(endpoint: string) {
    const target = this.target();
    try {
      const { data } = await axios.get(`https://api.mslmc.cn/v4${endpoint}`, {
        params: { os: target.platform, arch: target.arch },
        headers: { "User-Agent": "ElementsPanel" },
        timeout: 15000,
        maxContentLength: 1024 * 1024,
        signal: this.controller.signal
      });
      if (data?.code !== 200 || data.data == null)
        throw new Error(data?.message || "Invalid MSL response");
      return data.data;
    } catch (error: any) {
      throw new Error(
        `${this.t("TXT_CODE_javaMsl.sourceError")} ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async versions(): Promise<JavaCatalog> {
    const target = this.target();
    if (this.catalog && this.catalog.expires > Date.now()) return this.catalog.data;
    const data = await this.request("/jdk");
    if (
      !Array.isArray(data) ||
      data.some((version) => typeof version !== "string" || !/^[1-9][0-9]{0,2}$/.test(version))
    ) {
      throw new Error(this.t("TXT_CODE_javaMsl.sourceError"));
    }
    const result = {
      ...target,
      versions: [...new Set<string>(data)].sort((a, b) => Number(b) - Number(a))
    };
    this.catalog = { expires: Date.now() + 5 * 60 * 1000, data: result };
    return result;
  }

  async download(version: string): Promise<JavaDownload> {
    if (
      typeof version !== "string" ||
      !/^[1-9][0-9]{0,2}$/.test(version) ||
      !(await this.versions()).versions.includes(version)
    ) {
      throw new Error(this.t("TXT_CODE_javaMsl.invalidVersion"));
    }
    const data = await this.request(`/download/jdk/${encodeURIComponent(version)}`);
    if (typeof data?.url !== "string") throw new Error(this.t("TXT_CODE_javaMsl.sourceError"));
    const url = new URL(data.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (data.sha256 != null &&
        (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(data.sha256)))
    ) {
      throw new Error(this.t("TXT_CODE_javaMsl.sourceError"));
    }
    const archive = url.pathname.endsWith(".zip")
      ? "zip"
      : url.pathname.endsWith(".tar.gz")
      ? "tar.gz"
      : this.platform === "win32"
      ? "zip"
      : "tar.gz";
    return { url: data.url, sha256: data.sha256, archive };
  }

  dispose() {
    this.controller.abort();
    this.catalog = undefined;
  }
}
