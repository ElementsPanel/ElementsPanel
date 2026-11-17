export function checkSafeUrl(url: string) {
  try {
    const urlObj = new URL(url);
    if (!["http:", "https:"].includes(urlObj.protocol) || urlObj.username || urlObj.password) {
      return false;
    }
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

    if (!hostname.includes(".")) {
      return false;
    }

    const parts = hostname.split(".");
    if (parts.length < 2 || parts.some((part) => part.length === 0)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
