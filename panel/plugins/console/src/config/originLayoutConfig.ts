export enum LayoutCardHeight {
  MINI = "100px",
  SMALL = "200px",
  MEDIUM = "400px",
  BIG = "600px",
  LARGE = "800px",
  AUTO = "unset"
}

/**
 * Layout files written by older panel versions stored the enum member name
 * (`MINI`, `SMALL`, ...) instead of its CSS value.  Those values are ignored
 * by `min-height`, which collapses cards whose content also uses `height: 100%`.
 * Keep accepting them when reading persisted layouts so existing users do not
 * lose the affected cards after the plugin migration.
 */
const LEGACY_LAYOUT_CARD_HEIGHTS: Record<string, LayoutCardHeight> = {
  MINI: LayoutCardHeight.MINI,
  SMALL: LayoutCardHeight.SMALL,
  MEDIUM: LayoutCardHeight.MEDIUM,
  BIG: LayoutCardHeight.BIG,
  LARGE: LayoutCardHeight.LARGE,
  AUTO: LayoutCardHeight.AUTO
};

function normalizeCardHeight(height: unknown): string {
  if (typeof height !== "string") return LayoutCardHeight.AUTO;
  return LEGACY_LAYOUT_CARD_HEIGHTS[height] ?? height;
}

export let ORIGIN_LAYOUT_CONFIG: IPageLayoutConfig[] = [];

export function setAllLayoutConfig(cfg: IPageLayoutConfig[]) {
  ORIGIN_LAYOUT_CONFIG = cfg.map((page) => ({
    ...page,
    items: (page.items || []).map((card) => ({
      ...card,
      height: normalizeCardHeight(card.height)
    }))
  }));
}

export function getAllLayoutConfig() {
  return ORIGIN_LAYOUT_CONFIG;
}
