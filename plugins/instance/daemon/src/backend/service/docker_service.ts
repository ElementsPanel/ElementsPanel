import Docker from "dockerode";
import http from "http";
import https from "https";
import { normalizeDockerPlatform } from "mcsmanager-common";
import { Readable } from "node:stream";
import os from "os";

function resolveDockerOptionsFromEnv(): Docker.DockerOptions {
  const dockerHost = process.env.DOCKER_HOST?.trim();
  if (dockerHost) {
    const options = parseDockerHostToDockerOptions(dockerHost);
    if (options) return options;
  }
  return {
    socketPath: os.platform() == "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock"
  };
}

function parseDockerHostToDockerOptions(dockerHost: string): Docker.DockerOptions | undefined {
  // Accept Docker socket URLs and raw paths, including rootless sockets.

  const value = dockerHost.trim();
  if (!value) return undefined;

  // Windows named pipe (Docker CLI uses: npipe:////./pipe/docker_engine)
  if (value.startsWith("npipe:")) {
    let pipePath = value.slice("npipe:".length);
    // Normalize named-pipe slashes without losing the ./ component.
    if (pipePath.startsWith("////")) pipePath = `//${pipePath.slice(4)}`;
    // URL parsing would normalize away "./", keep the canonical dockerode form.
    if (pipePath.startsWith("//pipe/")) pipePath = pipePath.replace("//pipe/", "//./pipe/");
    return { socketPath: pipePath };
  }

  if (value.startsWith("unix://")) {
    const socketPath = value.slice("unix://".length);
    return socketPath ? { socketPath } : undefined;
  }

  if (value.includes("://")) {
    try {
      const url = new URL(value);

      if (url.protocol === "unix:") {
        return url.pathname ? { socketPath: url.pathname } : undefined;
      }

      if (url.protocol === "tcp:" || url.protocol === "http:" || url.protocol === "https:") {
        const tlsEnabled = process.env.DOCKER_TLS_VERIFY?.trim() === "1";
        const protocol = url.protocol === "https:" ? "https" : tlsEnabled ? "https" : "http";
        const defaultPort = protocol === "https" ? 2376 : 2375;
        const port = url.port ? Number(url.port) : defaultPort;
        return {
          protocol,
          host: url.hostname,
          port
        };
      }
    } catch {
      // Invalid URLs may still be valid raw socket paths.
    }
  }

  return { socketPath: value };
}

export class DefaultDocker extends Docker {
  public static readonly defaultConfig: Docker.DockerOptions = {
    ...resolveDockerOptionsFromEnv()
  };

  constructor(p?: Docker.DockerOptions) {
    super(Object.assign({}, DefaultDocker.defaultConfig, p ?? {}));
  }
}

export class DockerManager {
  public docker: Docker;

  constructor(p?: any) {
    this.docker = new DefaultDocker(p);
  }

  public getDocker() {
    return this.docker;
  }

  async startBuildImage(dockerFileDir: string, dockerImageName: string) {
    const stream = await this.docker.buildImage(
      {
        context: dockerFileDir,
        src: ["Dockerfile"]
      },
      { t: dockerImageName }
    );
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(Readable.from(stream), (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  /** Return the daemon's native platform; discover additional buildx platforms separately. */
  async getSupportedPlatforms(): Promise<string[]> {
    try {
      const info = await this.docker.info();
      const platforms: string[] = [];

      const osType = info.OSType?.toLowerCase() || "linux";
      const arch = info.Architecture || os.arch();

      const archMap: Record<string, string> = {
        x86_64: "amd64",
        amd64: "amd64",
        aarch64: "arm64",
        arm64: "arm64",
        armv7l: "arm",
        armv6l: "arm",
        arm: "arm",
        loong64: "loong64",
        loongarch64: "loong64",
        ppc64le: "ppc64le",
        s390x: "s390x",
        i386: "386",
        "386": "386"
      };

      const platformArch = archMap[arch] || arch;
      const nativePlatform = `${osType}/${platformArch}`;
      platforms.push(nativePlatform);

      return platforms;
    } catch (error: any) {
      const osType = os.platform() === "win32" ? "windows" : "linux";
      const nodeArch = os.arch();
      const archMap: Record<string, string> = {
        x64: "amd64",
        arm64: "arm64",
        arm: "arm",
        loong64: "loong64"
      };
      const platformArch = archMap[nodeArch] || nodeArch;
      return [`${osType}/${platformArch}`];
    }
  }

  async getImagePlatforms(imageName: string): Promise<string[]> {
    try {
      return await this.getImagePlatformsFromRegistry(imageName);
    } catch (error: any) {
      return [];
    }
  }

  /** Read image platforms from the registry HTTP API v2. */
  private async getImagePlatformsFromRegistry(imageName: string): Promise<string[]> {
    try {
      // Parse image name: registry/repo/image:tag or repo/image:tag
      const parts = imageName.split("/");
      let registry = "registry-1.docker.io";
      let repository: string;
      let tag = "latest";

      if (parts.length === 1) {
        const [img, imgTag] = parts[0].includes(":") ? parts[0].split(":") : [parts[0], "latest"];
        repository = `library/${img}`;
        tag = imgTag;
      } else if (parts.length === 2) {
        if (parts[0].includes(".") || parts[0].includes(":")) {
          registry = parts[0];
          const [repo, repoTag] = parts[1].includes(":")
            ? parts[1].split(":")
            : [parts[1], "latest"];
          repository = repo;
          tag = repoTag;
        } else {
          const [repo, repoTag] = parts[1].includes(":")
            ? parts[1].split(":")
            : [parts[1], "latest"];
          repository = `${parts[0]}/${repo}`;
          tag = repoTag;
        }
      } else {
        registry = parts[0];
        const lastPart = parts[parts.length - 1];
        const [lastRepo, lastTag] = lastPart.includes(":")
          ? lastPart.split(":")
          : [lastPart, "latest"];
        repository = parts.slice(1, -1).concat(lastRepo).join("/");
        tag = lastTag;
      }

      const registryUrl = registry.includes("://") ? registry : `https://${registry}`;
      const url = new URL(registryUrl);
      const protocol = url.protocol === "https:" ? https : http;

      return new Promise((resolve) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `/v2/${repository}/manifests/${tag}`,
          method: "GET",
          headers: {
            Accept:
              "application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json"
          }
        };

        const req = protocol.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode !== 200) {
              resolve([]);
              return;
            }

            try {
              const manifest = JSON.parse(data);
              const platforms: string[] = [];

              if (manifest.manifests && Array.isArray(manifest.manifests)) {
                for (const m of manifest.manifests) {
                  if (m.platform) {
                    platforms.push(normalizeDockerPlatform(m.platform));
                  }
                }
              } else if (manifest.config || manifest.layers) {
                if (manifest.config?.digest) {
                  // Single-platform manifests need a config-blob lookup; return no platform hints for now.
                }
              }

              resolve(platforms);
            } catch (parseError) {
              resolve([]);
            }
          });
        });

        req.on("error", () => {
          resolve([]);
        });

        req.setTimeout(5000, () => {
          req.destroy();
          resolve([]);
        });

        req.end();
      });
    } catch (error: any) {
      return [];
    }
  }
}
