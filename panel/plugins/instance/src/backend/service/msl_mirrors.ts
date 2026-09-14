import axios from "axios";
import type { MinecraftServerSelection } from "../../../../../../common/src/minecraft";
import { MINECRAFT_SERVERS, minecraftServersForType } from "../../minecraft";
import { $t } from "../runtime";

const API_URL = "https://api.mslmc.cn/v4";
const CACHE_TTL = 5 * 60 * 1000;

export class MslMirrorsService {
  private readonly cache = new Map<string, { expires: number; data: unknown }>();

  private segment(value: unknown): string {
    if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/.test(value)) {
      throw new Error($t("TXT_CODE_minecraft.invalidSelection"));
    }
    return encodeURIComponent(value);
  }

  private async request<T>(
    endpoint: string,
    validate: (data: any) => T,
    cached = true
  ): Promise<T> {
    const now = Date.now();
    for (const [key, entry] of this.cache) if (entry.expires <= now) this.cache.delete(key);
    const previous = this.cache.get(endpoint);
    if (cached && previous) return previous.data as T;
    try {
      const { data } = await axios.get<{ code: number; message?: string; data: T }>(
        `${API_URL}${endpoint}`,
        {
          headers: { "User-Agent": "ElementsPanel" },
          timeout: 15000,
          maxContentLength: 2 * 1024 * 1024
        }
      );
      if (data?.code !== 200 || data.data == null)
        throw new Error(data?.message || "Invalid MSL response");
      const result = validate(data.data);
      if (cached) {
        if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(endpoint, { expires: now + CACHE_TTL, data: result });
      }
      return result;
    } catch (error: any) {
      throw new Error(
        `${$t("TXT_CODE_minecraft.sourceError")} ${error.response?.data?.message || error.message}`
      );
    }
  }

  private strings(data: unknown): string[] {
    if (!Array.isArray(data) || data.some((value) => typeof value !== "string")) {
      throw new Error($t("TXT_CODE_minecraft.sourceError"));
    }
    return [...new Set(data)].filter((value) => /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/.test(value));
  }

  async servers() {
    return this.request("/mirrors?view=list", (data) => this.strings(data));
  }

  async versions(server: string) {
    const encoded = this.segment(server);
    if (!(await this.servers()).includes(server))
      throw new Error($t("TXT_CODE_minecraft.invalidSelection"));
    return this.request(`/mirrors/${encoded}`, (data) => ({
      versions: this.strings(data?.versions),
      description: typeof data?.description === "string" ? data.description : ""
    }));
  }

  async builds(server: string, version: string) {
    const encodedServer = this.segment(server);
    const encodedVersion = this.segment(version);
    if (!(await this.versions(server)).versions.includes(version))
      throw new Error($t("TXT_CODE_minecraft.invalidSelection"));
    return this.request(`/mirrors/${encodedServer}/${encodedVersion}`, (data) =>
      this.strings(data)
    );
  }

  async resolve(selection: MinecraftServerSelection, instanceType: string) {
    const { server, version, build } = selection;
    const encodedServer = this.segment(server);
    const encodedVersion = this.segment(version);
    const encodedBuild = this.segment(build);
    if (
      !minecraftServersForType(await this.servers(), instanceType).includes(server) ||
      !(await this.builds(server, version)).includes(build)
    ) {
      throw new Error($t("TXT_CODE_minecraft.invalidSelection"));
    }
    const result = await this.request(
      `/download/server/${encodedServer}/${encodedVersion}?build=${encodedBuild}`,
      (data): { url: string; sha256?: string } => {
        if (typeof data?.url !== "string") throw new Error($t("TXT_CODE_minecraft.sourceError"));
        const url = new URL(data.url);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (data.sha256 != null &&
            (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(data.sha256)))
        ) {
          throw new Error($t("TXT_CODE_minecraft.sourceError"));
        }
        return { url: data.url, sha256: data.sha256 };
      },
      false
    );
    return { ...result, ...MINECRAFT_SERVERS[server] };
  }
}
