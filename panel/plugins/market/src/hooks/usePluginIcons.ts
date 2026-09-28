import { onScopeDispose, ref } from "vue";
import { pluginMarketIcon } from "../api";

interface IconRequest {
  version?: string;
  controller: AbortController;
  dataUrl?: string;
  pending?: Promise<void>;
}

/**
 * Cache each plugin's current release icon within this component's scope.
 * Failed or missing images stay retryable; older markets without `hasIcon`
 * retain the default icon and make no image request.
 */
export function usePluginIcons() {
  const icons = ref<Record<string, string>>(Object.create(null));
  const requests = new Map<string, IconRequest>();
  let disposed = false;

  async function fetchIcon(pluginId: string, request: IconRequest) {
    try {
      const { execute } = pluginMarketIcon();
      const response = await execute({
        params: { pluginId, version: request.version },
        signal: request.controller.signal
      });
      if (disposed || request.controller.signal.aborted || requests.get(pluginId) !== request)
        return;
      const dataUrl = response.value?.dataUrl;
      if (typeof dataUrl === "string" && dataUrl) {
        request.dataUrl = dataUrl;
        icons.value[pluginId] = dataUrl;
      }
    } catch {
      // Keep the default icon; a later catalogue refresh can retry this request.
    }
  }

  function load(pluginId: string, hasIcon?: boolean, version?: string): Promise<void> {
    if (disposed) return Promise.resolve();
    const previous = requests.get(pluginId);
    if (hasIcon && previous && previous.version === version) {
      if (previous.dataUrl) return Promise.resolve();
      if (previous.pending) return previous.pending;
    }

    previous?.controller.abort();
    requests.delete(pluginId);
    delete icons.value[pluginId];
    if (!hasIcon) return Promise.resolve();

    const request: IconRequest = { version, controller: new AbortController() };
    requests.set(pluginId, request);
    request.pending = fetchIcon(pluginId, request).finally(() => {
      request.pending = undefined;
    });
    return request.pending;
  }

  onScopeDispose(() => {
    disposed = true;
    requests.forEach((request) => request.controller.abort());
    requests.clear();
    icons.value = Object.create(null);
  });

  return { icons, load };
}
