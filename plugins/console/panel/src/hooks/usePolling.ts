import { onMounted, onUnmounted, watch } from "vue";
import { useDesktopWindowActivity } from "./useDesktopWindowActivity";

/** Run once on mount, then wait between completed requests when an interval is supplied. */
export function usePolling(
  refresh: () => Promise<unknown>,
  interval?: number,
  { immediate = true }: { immediate?: boolean } = {}
) {
  let disposed = false;
  let mounted = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const activity = useDesktopWindowActivity();
  const canPoll = () => activity.visible.value && !activity.interacting.value;

  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(poll, delay);
  };

  const poll = async () => {
    if (disposed || running) return;
    running = true;
    try {
      await refresh();
    } catch (error) {
      console.error("Polling request failed:", error);
    } finally {
      running = false;
      if (!disposed && interval !== undefined && canPoll()) schedule(interval);
    }
  };

  const stop = watch(
    canPoll,
    (available) => {
      clearTimeout(timer);
      if (available && mounted && !running && interval !== undefined)
        schedule(Math.min(200, interval));
    },
    { flush: "sync" }
  );
  onMounted(() => {
    mounted = true;
    if (immediate) return poll();
    if (interval !== undefined && canPoll()) schedule(interval);
  });
  onUnmounted(() => {
    disposed = true;
    stop();
    clearTimeout(timer);
  });
}
