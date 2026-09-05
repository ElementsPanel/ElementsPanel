import type { LayoutCard } from "@/types";
import { shallowReactive } from "vue";

// Card implementations and picker entries are contributed by plugins. The
// `console` plugin owns the built-in Web UI cards; feature plugins add theirs
// through the same registry.
export const LAYOUT_CARD_TYPES: Record<string, any> = shallowReactive({});

export interface NewCardItem extends LayoutCard {
  category: import("@/types").NEW_CARD_TYPE;
  permission: import("./router").ROLE;
}

export type LayoutCardPoolItemFactory = () => NewCardItem;

export const PLUGIN_LAYOUT_CARD_POOL_FACTORIES = shallowReactive<LayoutCardPoolItemFactory[]>([]);

export function getLayoutCardPool() {
  return PLUGIN_LAYOUT_CARD_POOL_FACTORIES.map((createItem) => createItem());
}
