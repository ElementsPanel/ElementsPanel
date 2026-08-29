/**
 * `GET /api/overview` reports what the whole panel needs: the nodes, the panel
 * process and the host it runs on. Anything beyond that — the CPU/request
 * history the monitoring page charts, for instance — is contributed by a
 * plugin, so the core neither collects nor knows about it.
 *
 * Keep this module dependency-free so it can be imported from anywhere.
 */

export type OverviewProvider = () =>
  | Record<string, unknown>
  | Promise<Record<string, unknown>>;

const providers = new Set<OverviewProvider>();

export function registerOverviewProvider(provider: OverviewProvider) {
  if (typeof provider !== "function") throw new Error("Invalid overview provider");
  providers.add(provider);
  return () => providers.delete(provider);
}

export function clearOverviewProviders() {
  providers.clear();
}

/**
 * Merge every provider's fields into the overview payload. A provider that
 * throws is skipped: a broken extra chart must not take the whole page down.
 */
export async function collectOverviewExtras(): Promise<Record<string, unknown>> {
  const extras: Record<string, unknown> = {};
  for (const provider of providers) {
    try {
      Object.assign(extras, await provider());
    } catch (error) {
      // Reported by the caller's logger if it cares; the payload stays valid.
    }
  }
  return extras;
}
