import type Router from "@koa/router";
import type { createMarketInventory } from "./service/inventory";
import type { createMarketCatalogue } from "./service/catalogue";
import type { createMarketUpdates } from "./service/updates";
import type { createMarketOperations } from "./service/operations";
import type { createMarketRestart } from "./service/restart";

export type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
export type MarketRouter = Router;
export type MarketInventory = ReturnType<typeof createMarketInventory>;
export type MarketCatalogue = ReturnType<typeof createMarketCatalogue>;
export type MarketOperations = ReturnType<typeof createMarketOperations>;
export interface MarketServices {
  inventory: MarketInventory;
  catalogue: MarketCatalogue;
  operations: MarketOperations;
  updates: ReturnType<typeof createMarketUpdates>;
  restart: ReturnType<typeof createMarketRestart>;
}
