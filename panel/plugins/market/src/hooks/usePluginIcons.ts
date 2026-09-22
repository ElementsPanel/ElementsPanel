import { ref } from "vue";
import { pluginMarketIcon } from "../api";

/**
 * The icons of the plugins currently on screen, as data URLs keyed by plugin id.
 *
 * The image is fetched through the panel, one request per plugin, and only for
 * plugins the market says have one (`hasIcon`). A data URL is what the backend
 * answers with — see `pluginMarketIcon` — so the result goes straight into an
 * `<img>` with no second request that would have to authenticate on its own.
 *
 * A plugin with no icon simply has no entry here, and the card keeps the default
 * icon; a failure is not reported, because a missing icon is not an error.
 */
export function usePluginIcons() {
  const icons = ref<Record<string, string>>({});
  // 同一张图不会重复请求：卡片重渲染、列表刷新都会走到 load()。
  const requested = new Set<string>();

  async function load(pluginId: string, hasIcon?: boolean) {
    if (!hasIcon || requested.has(pluginId)) return;
    requested.add(pluginId);
    try {
      const { execute } = pluginMarketIcon();
      const response = await execute({ params: { pluginId } });
      const dataUrl = response.value?.dataUrl;
      if (dataUrl) icons.value = { ...icons.value, [pluginId]: dataUrl };
    } catch {
      // 图标缺失或市场不可达：保持默认图标即可，不必打扰用户。
    }
  }

  return { icons, load };
}
