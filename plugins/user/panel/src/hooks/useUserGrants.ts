import { onUnmounted, ref } from "vue";
import { useUserOperations } from "../services/userOperations";
import type { AccessInstance } from "../types";

export function useUserGrants() {
  const operations = useUserOperations();
  const instances = ref<AccessInstance[]>([]);
  let requestId = 0;

  const load = async (
    uuid: string,
    options: { forceRequest?: boolean; map?: (items: AccessInstance[]) => AccessInstance[] } = {}
  ) => {
    const request = ++requestId;
    const response = await operations.readGrants(uuid, options.forceRequest);
    if (request !== requestId) return;
    const items = response.value?.instances ?? [];
    instances.value = options.map ? options.map(items) : [...items];
  };
  const clear = () => {
    requestId++;
    instances.value = [];
  };
  const save = (uuid: string) => operations.writeGrants(uuid, instances.value);

  onUnmounted(clear);
  return { instances, load, save, clear };
}
