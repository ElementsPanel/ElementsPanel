import { apiService, type RequestConfig } from "@/services/apiService";
import { ref, shallowRef, type Ref } from "vue";

export function executeRequest<T>(baseConfig: RequestConfig) {
  const state = ref<T>() as Ref<T | undefined>;
  const error = shallowRef<unknown>();
  const isLoading = ref(false);
  const isReady = ref(false);
  let latestRequest = 0;

  const execute = async (config: RequestConfig = {}) => {
    const request = ++latestRequest;
    isLoading.value = true;
    isReady.value = false;
    error.value = undefined;
    try {
      // An override belongs to this invocation, never to the next request.
      const result = await apiService.subscribe<T>({ ...baseConfig, ...config });
      if (request === latestRequest) {
        state.value = result;
        isReady.value = true;
      }
      return result;
    } catch (cause) {
      if (request === latestRequest) error.value = cause;
      throw cause;
    } finally {
      if (request === latestRequest) isLoading.value = false;
    }
  };

  return { state, error, isLoading, isReady, execute };
}
