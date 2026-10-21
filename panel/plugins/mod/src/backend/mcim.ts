// MCIM preserves the upstream API paths and response shapes.
// https://mcimirror.top/guide/start/getting-started

/**
 * Which upstream to try first. The other one stays available as a fallback, so
 * a preference never removes a path — it only decides the order.
 */
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

/** The base URLs of the preferred upstream, one per API. */
export function apiBase(preference: ModSourcePreference) {
  return API_BASES[preference];
}

// The official CurseForge API authenticates every request with this key; the
// mirror proxies it, so only requests that actually reach the official base
// carry it.
const CURSEFORGE_KEY_HEADERS = {
  "x-api-key": "$2a$10$S.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6.v.m6"
};

export function curseforgeKeyHeaders(url: string) {
  return url.startsWith(`${API_BASES.official.curseforge}/`) ? CURSEFORGE_KEY_HEADERS : {};
}

/**
 * Maps a URL on either base onto the other base, which is what makes the
 * fallback direction follow the preference instead of being hard-wired.
 */
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

/**
 * Orders one file's download URLs by the preference: the preferred host becomes
 * `url` and the other one becomes `fallbackUrl`. Files the mirror does not
 * proxy keep their single URL in either mode.
 */
export function withMirrorDownload<T extends { url?: string }>(
  file: T,
  preference: ModSourcePreference
): T & { fallbackUrl?: string } {
  if (!file.url) return file;
  const fallbackUrl = mirrorFileUrl(file.url);
  // Nothing to reorder when the mirror cannot proxy this file.
  if (fallbackUrl === file.url) return file;
  return preference === "mirror"
    ? { ...file, url: fallbackUrl, fallbackUrl: file.url }
    : { ...file, fallbackUrl };
}
