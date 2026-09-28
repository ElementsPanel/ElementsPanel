import { lookup } from "node:dns";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

// Special-purpose ranges are not valid destinations for user-supplied downloads.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const blocked = new BlockList();
const privateV4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  // Azure's platform endpoint uses a globally numbered, host-local address.
  ["168.63.129.16", 32]
];
for (const [address, prefix] of privateV4) {
  blocked.addSubnet(address, prefix, "ipv4");
  blocked.addSubnet(`64:ff9b::${address}`, 96 + prefix, "ipv6");
}
for (const [address, prefix] of [
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20]
] as [string, number][]) {
  blocked.addSubnet(address, prefix, "ipv6");
}
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
// Mapped IPv4 and the public NAT64 prefix retain the embedded IPv4 restrictions.
publicV6.addSubnet("::ffff:0:0", 96, "ipv6");
publicV6.addSubnet("64:ff9b::", 96, "ipv6");

function denied() {
  return Object.assign(new Error("Download URL must use a public HTTP(S) address"), {
    code: "ERR_UNSAFE_DOWNLOAD_URL"
  });
}

export function isPublicAddress(address: string): boolean {
  if (address.includes("%")) return false;
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

const hostname = (value: string) => value.replace(/^\[|\]$/g, "").toLowerCase();

// Clash/Mihomo and sing-box can resolve public CDNs to these synthetic ranges.
// They are still non-public: only verified HTTPS to known catalog hosts may use
// them, never arbitrary downloads, literal IPs or other private addresses.
const proxyAddresses = new BlockList();
proxyAddresses.addSubnet("198.18.0.0", 15, "ipv4");
proxyAddresses.addSubnet("fdfe:dcba:9876::", 48, "ipv6");
const isCatalogHost = (host: string) => {
  const domain = hostname(host).replace(/\.$/, "");
  return (
    ["cdn.modrinth.com", "api.spiget.org", "cdn.spiget.org"].includes(domain) ||
    domain.endsWith(".forgecdn.net")
  );
};
const isProxyAddress = (address: string) =>
  !address.includes("%") && proxyAddresses.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");

export function assertPublicDownloadUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw denied();
  const host = hostname(url.hostname);
  if (isIP(host)) {
    // Literal addresses skip Node's lookup callback, so validate them here.
    if (!isPublicAddress(host)) throw denied();
  } else {
    const domain = host.replace(/\.$/, "");
    if (!domain.includes(".") || domain.endsWith(".localhost") || domain.endsWith(".local"))
      throw denied();
  }
  return url;
}

/** Validate exactly the addresses handed to the socket; there is no second DNS lookup. */
function lookupDownloadAddress(
  host: string,
  options: Parameters<LookupFunction>[1],
  callback: Parameters<LookupFunction>[2],
  allowProxyAddress = false
) {
  lookup(host, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (
      !addresses.length ||
      addresses.some(
        (entry) =>
          isIP(entry.address) !== entry.family ||
          (!isPublicAddress(entry.address) && !(allowProxyAddress && isProxyAddress(entry.address)))
      )
    )
      return callback(denied(), []);
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

export const lookupPublicAddress: LookupFunction = (host, options, callback) =>
  lookupDownloadAddress(host, options, callback);
const lookupCatalogAddress: LookupFunction = (host, options, callback) =>
  lookupDownloadAddress(host, options, callback, isCatalogHost(host));

// Dedicated agents cannot reuse a socket opened by an unrelated, unchecked API.
const httpAgent = new HttpAgent({ keepAlive: false, lookup: lookupPublicAddress });
const httpsAgent = new HttpsAgent({ keepAlive: false, lookup: lookupPublicAddress });
const catalogHttpsAgent = new HttpsAgent({
  keepAlive: false,
  lookup: lookupCatalogAddress,
  rejectUnauthorized: true
});
const httpsAgentFor = (url: URL) =>
  url.protocol === "https:" && !url.port && isCatalogHost(url.hostname)
    ? catalogHttpsAgent
    : httpsAgent;

export function publicDownloadRequestOptions(url: string) {
  const parsed = assertPublicDownloadUrl(url);
  return {
    adapter: "http" as const,
    // Environment proxies would move DNS resolution outside our checked socket.
    proxy: false as const,
    httpAgent,
    httpsAgent: httpsAgentFor(parsed),
    beforeRedirect(options: Record<string, unknown>) {
      const redirect = assertPublicDownloadUrl(String(options.href));
      if (
        hostname(String(options.hostname)) !== hostname(redirect.hostname) ||
        options.protocol !== redirect.protocol ||
        options.auth ||
        options.socketPath
      ) {
        throw denied();
      }
      // follow-redirects selects the next socket's agent from this map. Leaving
      // the catalog (or port 443) restores the strict public-address policy.
      options.agents = { http: httpAgent, https: httpsAgentFor(redirect) };
    }
  };
}
