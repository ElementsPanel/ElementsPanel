import { Service, type Context } from "cordis";
import type {
  DaemonFeaturesService,
  DaemonOverviewProvider,
  DaemonOverviewService
} from "../../../../src/plugin";

function claim(ctx: Context, entries: Map<string, boolean>, feature: string) {
  return ctx.effect(() => {
    if (entries.has(feature)) throw new Error(`Duplicate daemon feature: ${feature}`);
    entries.set(feature, true);
    return () => entries.delete(feature);
  });
}

export class FeaturesService extends Service implements DaemonFeaturesService {
  private readonly features = new Map<string, boolean>();
  constructor(ctx: Context) { super(ctx, "features", true); }
  add(feature: string) {
    if (!feature) throw new Error("Invalid daemon feature registration");
    return claim(this.ctx, this.features, feature);
  }
  has(feature: string) { return this.features.get(feature) === true; }
  all() { return Object.fromEntries(this.features); }
}

export class OverviewService extends Service implements DaemonOverviewService {
  private readonly providers = new Set<DaemonOverviewProvider>();
  constructor(ctx: Context) { super(ctx, "overview", true); }
  provide(provider: DaemonOverviewProvider) {
    if (typeof provider !== "function") throw new Error("Invalid daemon overview provider");
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
