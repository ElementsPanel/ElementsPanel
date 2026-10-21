// MCIM preserves the upstream API paths and response shapes.
// https://mcimirror.top/guide/start/getting-started
export const MODRINTH_API = "https://mod.mcimirror.top/modrinth/v2";
export const CURSEFORGE_API = "https://mod.mcimirror.top/curseforge/v1";

export function upstreamRequest(url: string) {
  if (url.startsWith(`${MODRINTH_API}/`)) {
    return { url: url.replace(MODRINTH_API, "https://api.modrinth.com/v2") };
  }
  if (url.startsWith(`${CURSEFORGE_API}/`)) {
    return {
      url: url.replace(CURSEFORGE_API, "https://api.curse.tools/v1/cf"),
      // Retain the previous provider's header only on requests to that provider.
      headers: {
        "x-api-key": "$2a$10$S.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6"
      }
    };
  }
}

function mirrorFileUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !["cdn.modrinth.com", "edge.forgecdn.net"].includes(url.hostname)
    ) {
      return value;
    }
    // mediafilez.forgecdn.net is deliberately excluded by MCIM's documentation.
    url.protocol = "https:";
    url.hostname = "mod.mcimirror.top";
    return url.toString();
  } catch {
    return value;
  }
}

export function withMirrorDownload<T extends { url?: string }>(
  file: T
): T & { fallbackUrl?: string } {
  if (!file.url) return file;
  const fallbackUrl = mirrorFileUrl(file.url);
  // MCIM recommends trying the official file first and its mirror on failure.
  return fallbackUrl === file.url ? file : { ...file, fallbackUrl };
}
