import { createGlobalState } from "@vueuse/core";
import { computed, ref } from "vue";
import { apiService, onApiMutation } from "@/services/apiService";
import { createTaskStream, type TaskStreamState, type TaskStreamUpdate } from "@/hooks/useTaskStream";
import { useAppStateStore } from "./useAppStateStore";

export interface BackgroundTask {
  id: string;
  daemonId: string;
  nodeName: string;
  instanceUuid: string;
  kind: string;
  name: string;
  state: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  updatedAt: number;
  current: number;
  total: number;
  error?: string;
  cancellable: boolean;
}

const sortTasks = (a: BackgroundTask, b: BackgroundTask) =>
  Number(b.state === "running") - Number(a.state === "running") || b.startedAt - a.startedAt;

export const useBackgroundTasks = createGlobalState(() => {
  const { state, isLogged } = useAppStateStore();
  const open = ref(false);
  const tasks = ref<BackgroundTask[]>([]);
  const unavailable = ref(false);
  const loading = ref(false);
  const error = ref(false);
  const streamState = ref<TaskStreamState>("degraded");
  const activeCount = computed(() => tasks.value.filter((task) => task.state === "running").length);
  let generation = 0;
  /** Bumped by every pushed snapshot, so an older GET cannot overwrite it. */
  let pushVersion = 0;
  let controller: AbortController | undefined;
  let queued = false;
  let stream: ReturnType<typeof createTaskStream> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdogTimer: ReturnType<typeof setTimeout> | undefined;

  const stopFallback = () => {
    clearTimeout(fallbackTimer);
    fallbackTimer = undefined;
  };

  const stopWatchdog = () => {
    clearTimeout(watchdogTimer);
    watchdogTimer = undefined;
  };

  /**
   * Low-frequency polling is a fallback only: an unreachable socket, or a daemon
   * too old to push snapshots. A delivered push stops it again.
   */
  const scheduleFallback = () => {
    if (fallbackTimer || !isLogged.value) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = undefined;
      if (!isLogged.value) return;
      void refresh({ silent: true }).finally(scheduleFallback);
    }, open.value ? 5_000 : 15_000);
  };

  /** Detects an old daemon: running work but no push for a whole interval. */
  const armWatchdog = () => {
    stopWatchdog();
    if (streamState.value !== "connected" || !activeCount.value) return;
    watchdogTimer = setTimeout(() => {
      watchdogTimer = undefined;
      if (streamState.value === "connected" && activeCount.value > 0) scheduleFallback();
    }, 15_000);
  };

  const applyUpdate = (update: TaskStreamUpdate) => {
    pushVersion++;
    const incoming = (update.tasks || []).map((task) => ({
      ...task,
      daemonId: update.daemonId,
      nodeName: update.nodeName
    }));
    tasks.value = [
      ...tasks.value.filter((task) => task.daemonId !== update.daemonId),
      ...incoming
    ].sort(sortTasks);
    unavailable.value = !!update.unavailable;
    error.value = false;
    stopFallback();
    armWatchdog();
  };

  const handleState = (next: TaskStreamState) => {
    streamState.value = next;
    if (next === "connected") {
      stopFallback();
      armWatchdog();
      // One HTTP read per connection keeps reconnects authoritative without
      // turning the stream into a poll.
      void refresh({ silent: true });
    } else {
      stopWatchdog();
      scheduleFallback();
    }
  };

  const reset = () => {
    generation++;
    pushVersion++;
    controller?.abort();
    controller = undefined;
    queued = false;
    open.value = false;
    tasks.value = [];
    unavailable.value = error.value = loading.value = false;
    disconnect();
  };

  const refresh = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isLogged.value) return;
    // A mutation may land while a read is still in flight; remember it and
    // re-read once the current request settles instead of dropping the update.
    if (controller) {
      queued = true;
      return;
    }
    const currentGeneration = generation;
    const currentPushVersion = pushVersion;
    const userId = state.userInfo?.uuid;
    const requestController = new AbortController();
    controller = requestController;
    loading.value = !silent;
    try {
      const result = await apiService.subscribe<{ tasks: BackgroundTask[]; unavailable: boolean }>({
        url: "/api/tasks/",
        signal: requestController.signal,
        errorAlert: false
      });
      if (
        generation !== currentGeneration ||
        pushVersion !== currentPushVersion ||
        state.userInfo?.uuid !== userId
      )
        return;
      tasks.value = (result?.tasks || []).sort(sortTasks);
      unavailable.value = !!result?.unavailable;
      error.value = false;
      // An old daemon sends no pushes: start the watchdog from the tasks the
      // first read discovered, not only from a later push.
      armWatchdog();
    } catch {
      if (generation === currentGeneration) error.value = true;
    } finally {
      if (generation === currentGeneration) {
        loading.value = false;
        controller = undefined;
      }
      if (queued) {
        queued = false;
        void refresh({ silent: true });
      }
    }
  };

  // The daemon exposes tasks only through a pull endpoint, so new or cancelled
  // tasks are picked up by refreshing right after any successful write.
  onApiMutation(() => {
    if (isLogged.value) void refresh({ silent: true });
  });

  const connect = () => {
    if (!isLogged.value || stream) return;
    stream = createTaskStream({
      getTicket: async () => {
        const result = await apiService.subscribe<{ ticket: string }>({
          url: "/api/tasks/stream-ticket",
          forceRequest: true,
          errorAlert: false
        });
        return result?.ticket;
      },
      onUpdate: applyUpdate,
      onAvailability: (value) => {
        unavailable.value = value;
      },
      onState: handleState
    });
    stream.connect();
  };

  const disconnect = () => {
    stream?.dispose();
    stream = undefined;
    stopFallback();
    stopWatchdog();
    streamState.value = "degraded";
  };

  const cancel = async (task: BackgroundTask) => {
    await apiService.subscribe({
      url: "/api/tasks/cancel",
      method: "POST",
      data: { daemonId: task.daemonId, id: task.id }
    });
  };
  const clear = async () => {
    await apiService.subscribe({ url: "/api/tasks/", method: "DELETE" });
  };

  return {
    open,
    tasks,
    unavailable,
    loading,
    error,
    streamState,
    activeCount,
    refresh,
    reset,
    connect,
    disconnect,
    cancel,
    clear
  };
});
