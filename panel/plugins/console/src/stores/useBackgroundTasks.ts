import { createGlobalState } from "@vueuse/core";
import { computed, ref } from "vue";
import { apiService } from "@/services/apiService";
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

export const useBackgroundTasks = createGlobalState(() => {
  const { state, isLogged } = useAppStateStore();
  const open = ref(false);
  const tasks = ref<BackgroundTask[]>([]);
  const unavailable = ref(false);
  const loading = ref(false);
  const error = ref(false);
  const activeCount = computed(() => tasks.value.filter((task) => task.state === "running").length);
  let generation = 0;
  let controller: AbortController | undefined;

  const reset = () => {
    generation++;
    controller?.abort();
    controller = undefined;
    open.value = false;
    tasks.value = [];
    unavailable.value = error.value = loading.value = false;
  };

  const refresh = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isLogged.value || controller) return;
    const currentGeneration = generation;
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
      if (generation !== currentGeneration || state.userInfo?.uuid !== userId) return;
      tasks.value = result?.tasks || [];
      unavailable.value = !!result?.unavailable;
      error.value = false;
    } catch {
      if (generation === currentGeneration) error.value = true;
    } finally {
      if (generation === currentGeneration) {
        loading.value = false;
        controller = undefined;
      }
    }
  };

  const cancel = async (task: BackgroundTask) => {
    await apiService.subscribe({
      url: "/api/tasks/cancel",
      method: "POST",
      data: { daemonId: task.daemonId, id: task.id }
    });
    await refresh({ silent: true });
  };
  const clear = async () => {
    await apiService.subscribe({ url: "/api/tasks/", method: "DELETE" });
    await refresh({ silent: true });
  };

  return { open, tasks, unavailable, loading, error, activeCount, refresh, reset, cancel, clear };
});
