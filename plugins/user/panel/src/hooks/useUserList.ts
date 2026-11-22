import { computed, onUnmounted, ref } from "vue";
import { getUserInfo } from "@elementspanel/epanel-plugin-console/services/apis";
import type { UserQuery } from "../types";

type UserPage = NonNullable<ReturnType<typeof getUserInfo>["state"]["value"]>;

interface Options {
  query: () => UserQuery;
  onError: (error: unknown) => void;
  afterLoad?: () => void | Promise<void>;
  keepMissing?: boolean;
}

export function useUserList(options: Options) {
  const { execute, isLoading: loading } = getUserInfo();
  const data = ref<UserPage>();
  const total = ref(0);
  const users = computed(() => data.value?.data ?? []);
  let requestId = 0;

  const fetch = async () => {
    const request = ++requestId;
    try {
      const response = await execute({ params: options.query() });
      if (request !== requestId || (options.keepMissing && !response?.value)) return;
      data.value = response.value;
      total.value = response.value?.total ?? 0;
      await options.afterLoad?.();
    } catch (error) {
      if (request === requestId) options.onError(error);
    }
  };

  onUnmounted(() => {
    requestId++;
  });
  return { data, total, users, loading, fetch };
}
