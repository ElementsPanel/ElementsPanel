import { Service, type Context } from "cordis";
import type { PanelOverviewProvider, PanelOverviewService } from "../../../../../src/app/plugin";

/** Extension point for the monitor overview response. */
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
