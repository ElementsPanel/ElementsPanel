import { onUnmounted, ref, watch } from "vue";
import { getJavaList } from "../api";
import type { JavaRuntime } from "../types";

/** Refresh only while the view is open and a runtime is being installed. */
export function useJavaList(options: {
  daemonId: () => string;
  instanceId?: () => string;
  active: () => boolean;
}) {
  const javaList = ref<JavaRuntime[]>([]);
  const loading = ref(false);
  const error = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  let pending: Promise<JavaRuntime[]> | undefined;
  let controller: AbortController | undefined;

  function refresh(force = false): Promise<JavaRuntime[]> {
    if (disposed || !options.active()) return Promise.resolve(javaList.value);
    if (pending) return force ? pending.catch(() => {}).then(() => refresh()) : pending;
    clearTimeout(timer);
    const current = generation;
    controller = new AbortController();
    loading.value = true;
    pending = (async () => {
      try {
        const result = await getJavaList().execute({
          params: { daemonId: options.daemonId(), instanceId: options.instanceId?.() },
          forceRequest: true,
          signal: controller!.signal
        });
        const list = result.value ?? [];
        if (!disposed && current === generation) {
          javaList.value = list;
          error.value = "";
        }
        return list;
      } catch (cause: any) {
        if (!disposed && current === generation) error.value = cause.message;
        throw cause;
      } finally {
        if (!disposed && current === generation) {
          pending = undefined;
          loading.value = false;
          if (options.active() && javaList.value.some((item) => item.info.downloading)) {
            timer = setTimeout(() => void refresh().catch(() => {}), 2000);
          }
        }
      }
    })();
    return pending;
  }

  watch(
    () => [options.daemonId(), options.instanceId?.(), options.active()],
    () => {
      generation++;
      controller?.abort();
      pending = undefined;
      clearTimeout(timer);
      javaList.value = [];
      error.value = "";
      loading.value = false;
      if (options.active()) void refresh().catch(() => {});
    },
    { immediate: true }
  );
  onUnmounted(() => {
    disposed = true;
    generation++;
    controller?.abort();
    clearTimeout(timer);
  });
  return { javaList, loading, error, refresh };
}
