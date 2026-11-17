// MCIM preserves the upstream API paths and response shapes.
// https://mcimirror.top/guide/start/getting-started

/** Choose the first upstream while keeping the other as fallback. */
export type ModSourcePreference = "mirror" | "official";

const API_BASES = {
  mirror: {
    modrinth: "https://mod.mcimirror.top/modrinth/v2",
    curseforge: "https://mod.mcimirror.top/curseforge/v1"
  },
  official: {
    modrinth: "https://api.modrinth.com/v2",
    curseforge: "https://api.curse.tools/v1/cf"
  }
} as const;

export function apiBase(preference: ModSourcePreference) {
  return API_BASES[preference];
}

// Send the CurseForge API key only to the official API, not the mirror.
const CURSEFORGE_KEY_HEADERS = {
  "x-api-key": "$2a$10$S.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6"
};

export function curseforgeKeyHeaders(url: string) {
  return url.startsWith(`${API_BASES.official.curseforge}/`) ? CURSEFORGE_KEY_HEADERS : {};
}

/** Map between official and mirror URLs in either direction. */
export function upstreamRequest(url: string) {
  const mirror = API_BASES.mirror;
  const official = API_BASES.official;
  if (url.startsWith(`${mirror.modrinth}/`)) {
    return { url: url.replace(mirror.modrinth, official.modrinth) };
  }
  if (url.startsWith(`${mirror.curseforge}/`)) {
    return { url: url.replace(mirror.curseforge, official.curseforge) };
  }
  if (url.startsWith(`${official.modrinth}/`)) {
    return { url: url.replace(official.modrinth, mirror.modrinth) };
  }
  if (url.startsWith(`${official.curseforge}/`)) {
    return { url: url.replace(official.curseforge, mirror.curseforge) };
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

/** Order mirror-supported downloads by preference; leave unsupported URLs unchanged. */
export function withMirrorDownload<T extends { url?: string }>(
  file: T,
  preference: ModSourcePreference
): T & { fallbackUrl?: string } {
  if (!file.url) return file;
  const fallbackUrl = mirrorFileUrl(file.url);
  if (fallbackUrl === file.url) return file;
  return preference === "mirror"
    ? { ...file, url: fallbackUrl, fallbackUrl: file.url }
    : { ...file, fallbackUrl };
}

export function isMirrorDownloadUrl(value: string): boolean {
  try {
    return new URL(value).hostname === "mod.mcimirror.top";
  } catch {
    return false;
  }
}

/** Reapply the live preference to cached client URL pairs; reorder only supported mirror pairs. */
export function preferDownload(
  url: string,
  fallbackUrl: string | undefined,
  preference: ModSourcePreference
): { url: string; fallbackUrl?: string } {
  const candidates = [url, mirrorFileUrl(url), fallbackUrl].filter(
    (value, index, list): value is string => !!value && list.indexOf(value) === index
  );
  const mirror = candidates.find(isMirrorDownloadUrl);
  if (!mirror || candidates.every(isMirrorDownloadUrl)) return { url, fallbackUrl };
  const preferred =
    preference === "mirror" ? mirror : candidates.find((value) => !isMirrorDownloadUrl(value))!;
  return { url: preferred, fallbackUrl: candidates.find((value) => value !== preferred) };
}
