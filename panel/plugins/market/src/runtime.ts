import { ref } from "vue";
import { marketPublicConfig } from "./api";

// The terminal's reinstall button has to decide, synchronously and on every
// re-render, whether this user may install a package. So the answer is fetched
// once when the plugin becomes ready and read from here afterwards.

const allowUsePreset = ref(false);

export function getAllowUsePreset() {
  return allowUsePreset.value;
}

export function setAllowUsePreset(value: boolean) {
  allowUsePreset.value = value;
}

/**
 * Refresh the cached permission. Failures are swallowed: an unreachable or
 * forbidden endpoint just means "not allowed", which is the safe default and
 * is also what an anonymous visitor should see.
 */
export async function refreshMarketPermission() {
  try {
    const { execute } = marketPublicConfig();
    const state = await execute();
    allowUsePreset.value = Boolean(state.value?.allowUsePreset);
  } catch {
    allowUsePreset.value = false;
  }
}
