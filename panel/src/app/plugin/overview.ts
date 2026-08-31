import { Service, type Context } from "cordis";
import type { PanelOverviewProvider, PanelOverviewService } from "./context";

/**
 * `GET /api/overview` reports what the whole panel needs: the nodes, the panel
 * process and the host it runs on. Anything beyond that — the CPU and request
 * history the monitoring page charts, for instance — is contributed here by a
 * plugin, so the core neither collects nor knows about it.
 */
export class OverviewService extends Service implements PanelOverviewService {
  private readonly providers = new Set<PanelOverviewProvider>();

  constructor(ctx: Context) {
    super(ctx, "overview", true);
  }

  provide(provider: PanelOverviewProvider) {
    return this.ctx.effect(() => {
      this.providers.add(provider);
      return () => this.providers.delete(provider);
    });
  }

  /**
   * Merge every provider's fields into the payload. A provider that throws is
   * skipped and reported: one broken extra must not take the whole page down.
   */
  async collect() {
    const extras: Record<string, unknown> = {};
    for (const provider of this.providers) {
      try {
        Object.assign(extras, await provider());
      } catch (error) {
        this.ctx.logger("overview").warn("An overview provider failed:", error);
      }
    }
    return extras;
  }
}
