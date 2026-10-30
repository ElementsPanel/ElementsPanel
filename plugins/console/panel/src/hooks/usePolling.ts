import { onMounted, onUnmounted } from "vue";

/** Run once on mount, then wait between completed requests when an interval is supplied. */
export function usePolling(refresh: () => Promise<unknown>, interval?: number) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const poll = async () => {
    try {
      await refresh();
    } catch (error) {
      console.error("Polling request failed:", error);
    } finally {
      if (!disposed && interval !== undefined) timer = setTimeout(poll, interval);
    }
  };

  onMounted(poll);
  onUnmounted(() => {
    disposed = true;
    clearTimeout(timer);
  });
}
