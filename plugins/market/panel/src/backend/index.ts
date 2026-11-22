import type { PanelPluginContext, MarketServices } from "./types";
import { localeMessages } from "../i18n";
import { initMarketSettings } from "./service/market_settings";
import { registerMarketSettings } from "./service/settings_form";
import { createMarketInventory } from "./service/inventory";
import { createMarketCatalogue } from "./service/catalogue";
import { createMarketOperations } from "./service/operations";
import { createMarketUpdates } from "./service/updates";
import { createMarketRestart } from "./service/restart";
import { registerMarketStatus } from "./routers/status";
import { registerMarketCatalogue } from "./routers/catalogue";
import { registerMarketUpdates } from "./routers/updates";
import { registerMarketOperations } from "./routers/operations";

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settingsForm",
  "middleware",
  "roles",
  "remote",
  "identity",
  "plugins"
];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  await initMarketSettings(ctx);

  const inventory = createMarketInventory(ctx);
  const catalogue = createMarketCatalogue(ctx, inventory);
  const operations = createMarketOperations(ctx, inventory);
  const services: MarketServices = {
    inventory,
    catalogue,
    operations,
    updates: createMarketUpdates(ctx, inventory, catalogue, operations),
    restart: createMarketRestart(ctx)
  };
  const router = ctx.koa.router("/api/market");
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });
  registerMarketStatus(ctx, router, requireAdmin);
  registerMarketUpdates(ctx, router, requireAdmin, services);
  registerMarketCatalogue(ctx, router, requireAdmin, services);
  registerMarketOperations(ctx, router, requireAdmin, services);
  registerMarketSettings(ctx);
}
