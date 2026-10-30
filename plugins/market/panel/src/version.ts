/** Compare numeric releases and SemVer prereleases; build metadata has no precedence. */
export function isNewerVersion(candidate: string, installed: string): boolean {
  const parse = (value: string) => {
    const match =
      /^v?(\d+(?:\.\d+){0,2})(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(
        value.trim()
      );
    return match && { core: match[1].split("."), pre: match[2]?.split(".") };
  };
  const next = parse(candidate);
  const current = parse(installed);
  if (!next || !current) return false;

  for (let index = 0; index < 3; index++) {
    const a = BigInt(next.core[index] || "0");
    const b = BigInt(current.core[index] || "0");
    if (a !== b) return a > b;
  }
  if (!next.pre || !current.pre) return !next.pre && !!current.pre;
  for (let index = 0; index < Math.max(next.pre.length, current.pre.length); index++) {
    const a = next.pre[index];
    const b = current.pre[index];
    if (a === undefined || b === undefined) return b === undefined;
    if (a === b) continue;
    const numericA = /^\d+$/.test(a);
    const numericB = /^\d+$/.test(b);
    if (numericA && numericB) {
      if (BigInt(a) !== BigInt(b)) return BigInt(a) > BigInt(b);
    } else if (numericA !== numericB) return !numericA;
    else return a > b;
  }
  return false;
}
