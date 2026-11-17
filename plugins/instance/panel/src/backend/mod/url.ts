/** Reject local destinations to prevent SSRF through external requests. */
export function checkSafeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      return false;
    }

    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(hostname)) {
      return false;
    }

    const localDomains = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

    if (localDomains.includes(hostname)) {
      return false;
    }

    if (hostname.endsWith(".local")) {
      return false;
    }

    if (ipv4Regex.test(hostname)) {
      const parts = hostname.split(".").map(Number);
      // 10.0.0.0/8
      if (parts[0] === 10) return false;
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return false;
      // 127.0.0.0/8 (loopback)
      if (parts[0] === 127) return false;
      // 169.254.0.0/16 (link-local)
      if (parts[0] === 169 && parts[1] === 254) return false;
    }

    if (!hostname.includes(".")) {
      return false;
    }

    const parts = hostname.split(".");
    if (parts.length < 2 || parts.some((part) => part.length === 0)) {
      return false;
    }

    const allowedProtocols = ["http:", "https:"];
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
