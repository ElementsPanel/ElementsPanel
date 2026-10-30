import { executeRequest } from "@/hooks/useApi";
import type { RequestConfig } from "@/services/apiService";
import { ref, type Ref } from "vue";

export const useDefineApi = <P, T>(baseConfig: RequestConfig = {}) => {
  return () => {
    const { isLoading, state, isReady, execute } = executeRequest<T>(baseConfig);
    return {
      isLoading,
      state,
      isReady,
      execute: async (config?: P & RequestConfig) => {
        const result = await execute(config ?? {});
        // Return this call's result even if another request completed first.
        return ref(result) as Ref<T | undefined>;
      }
    };
  };
};
