import { createGlobalState } from "@vueuse/core";
import { reactive } from "vue";

/** Shell UI state that outlives any single page. */
export const useUiStore = createGlobalState(() => {
  const uiState = reactive({
    showPhoneMenu: false
  });

  return {
    uiState
  };
});
