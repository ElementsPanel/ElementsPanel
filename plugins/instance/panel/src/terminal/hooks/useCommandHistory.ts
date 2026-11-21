import { createGlobalState } from "@vueuse/core";
import { ref } from "vue";

const TERMINAL_HISTORY_KEY = "TERMINAL_HISTORY_KEY";
const MAX_STORED_HISTORY = 40;
const RECENT_HISTORY_DISPLAY_LIMIT = 40;

const useGlobalHistory = createGlobalState(() => {
  const recentHistory = ref<string[]>([]);
  const commandInputValue = ref<string>("");
  const navigation = { history: [] as string[], index: -1, draft: "" };
  return { recentHistory, commandInputValue, navigation };
});

export function useCommandHistory() {
  const { recentHistory, commandInputValue, navigation } = useGlobalHistory();

  const readStoredHistory = () =>
    JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) || "[]") as string[];

  const setHistory = (text: string) => {
    if (!text) return;
    const stored = readStoredHistory();
    const index = stored.indexOf(text);
    if (index !== -1) stored.splice(index, 1);
    stored.unshift(text);
    if (stored.length > MAX_STORED_HISTORY) stored.pop();
    localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(stored));
    recentHistory.value = stored.slice(0, RECENT_HISTORY_DISPLAY_LIMIT);
  };

  const getHistory = () => {
    return readStoredHistory().filter((item) => item.startsWith(commandInputValue.value));
  };

  recentHistory.value = readStoredHistory().slice(0, RECENT_HISTORY_DISPLAY_LIMIT);

  const resetHistorySelection = () => {
    navigation.history = [];
    navigation.index = -1;
    navigation.draft = "";
  };

  const clickHistoryItem = (item: string) => {
    commandInputValue.value = item;
    resetHistorySelection();
  };

  const handleHistorySelect = (e: KeyboardEvent) => {
    if (e.isComposing || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();

    if (navigation.index === -1) {
      if (e.key === "ArrowDown") return;
      navigation.draft = commandInputValue.value;
      navigation.history = getHistory();
      if (!navigation.history.length) return;
    }

    if (e.key === "ArrowUp") {
      navigation.index = Math.min(navigation.index + 1, navigation.history.length - 1);
    } else {
      navigation.index--;
    }

    commandInputValue.value =
      navigation.index === -1 ? navigation.draft : navigation.history[navigation.index];
  };

  return {
    recentHistory,
    commandInputValue,
    setHistory,
    getHistory,
    resetHistorySelection,
    clickHistoryItem,
    handleHistorySelect
  };
}
