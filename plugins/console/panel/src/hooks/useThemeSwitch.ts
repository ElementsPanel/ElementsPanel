import { t } from "@/lang/i18n";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { AppTheme } from "@/types/const";
import { computed } from "vue";

const themeModes = [
  { value: AppTheme.AUTO, label: "TXT_CODE_dc8de4ff", icon: "mdi-theme-light-dark" },
  { value: AppTheme.LIGHT, label: "TXT_CODE_673eac8e", icon: "mdi-weather-sunny" },
  { value: AppTheme.DARK, label: "TXT_CODE_5e4a370d", icon: "mdi-weather-night" }
];

export function useThemeSwitch() {
  const { currentTheme, setTheme } = useAppConfigStore();
  const modeIndex = computed(() => themeModes.findIndex((mode) => mode.value === currentTheme.value));
  const themeIcon = computed(() => (themeModes[modeIndex.value] ?? themeModes[0]).icon);
  const themeTitle = computed(() => t((themeModes[modeIndex.value] ?? themeModes[0]).label));

  const cycleTheme = () => {
    setTheme(themeModes[(modeIndex.value + 1) % themeModes.length].value);
  };

  return { themeIcon, themeTitle, cycleTheme };
}
