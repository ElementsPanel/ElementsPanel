import { createGlobalState } from "@vueuse/core";
import { ref } from "vue";

const TERMINAL_HISTORY_KEY = "TERMINAL_HISTORY_KEY";

const useGlobalHistory = createGlobalState(() => {
  const history = ref<string[]>([]);
  const recentHistory = ref<string[]>([]);
  const commandInputValue = ref<string>("");
  const focusHistoryList = ref(false);
  const selectLocation = ref(0);
  return { history, recentHistory, commandInputValue, focusHistoryList, selectLocation };
});

export function useCommandHistory() {
  const { history, recentHistory, commandInputValue, focusHistoryList, selectLocation } =
    useGlobalHistory();

  const readStoredHistory = () =>
    JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) || "[]") as string[];

  const setHistory = (text: string) => {
    if (!text) return;
    const stored = readStoredHistory();
    const index = stored.indexOf(text);
    if (index !== -1) stored.splice(index, 1);
    stored.unshift(text);
    if (stored.length > 30) stored.pop();
    localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(stored));
    recentHistory.value = stored.slice(0, 10);
  };

  const getHistory = () => {
    return readStoredHistory().filter((item) => item.startsWith(commandInputValue.value)).slice(0, 10);
  };

  history.value = getHistory();
  recentHistory.value = readStoredHistory().slice(0, 10);

  const openHistoryList = () => {
    history.value = getHistory();
    focusHistoryList.value = true;
    selectLocation.value = 0;
  };

  const closeHistoryList = () => {
    focusHistoryList.value = false;
  };

  const clickHistoryItem = (item: string) => {
    commandInputValue.value = item;
    closeHistoryList();
  };

  const handleHistorySelect = (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter" && e.key !== "Escape") {
      if (focusHistoryList.value === true) closeHistoryList();
      return;
    }
    if (e.key === "Escape") return closeHistoryList();
    if (e.key === "Enter" && focusHistoryList.value === false) return;
    if (focusHistoryList.value === false) {
      return openHistoryList();
    }
    if (e.key === "ArrowUp") {
      if (selectLocation.value <= 0) {
        selectLocation.value = history.value.length - 1;
      } else {
        selectLocation.value--;
      }
    }
    if (e.key === "ArrowDown") {
      if (selectLocation.value >= history.value.length - 1) {
        selectLocation.value = 0;
      } else {
        selectLocation.value++;
      }
    }
    if (e.key === "Enter") {
      commandInputValue.value = history.value[selectLocation.value];
      closeHistoryList();
    }
  };

  return {
    history,
    recentHistory,
    focusHistoryList,
    selectLocation,
    commandInputValue,
    setHistory,
    getHistory,
    openHistoryList,
    closeHistoryList,
    clickHistoryItem,
    handleHistorySelect
  };
}
