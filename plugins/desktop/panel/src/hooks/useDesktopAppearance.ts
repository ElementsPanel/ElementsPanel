import { computed, onMounted, onUnmounted, ref, type CSSProperties } from "vue";
import { useAppConfigStore } from "@elementspanel/epanel-plugin-console/stores/useAppConfigStore";
import {
  getAppearance,
  resolveBackgroundImage,
  type PanelAppearance
} from "@elementspanel/epanel-plugin-console/services/apis/appearance";
import { getDesktopSettings } from "../api";
import { DesktopSettings, normalizeDesktopSettings } from "../settings";

export function useDesktopAppearance() {
  const { isDarkTheme } = useAppConfigStore();

  const appearance = ref<PanelAppearance>();
  const backgroundImageUrl = computed(() =>
    resolveBackgroundImage(appearance.value, isDarkTheme.value)
  );
  const backgroundImageBlur = ref(5);
  const desktopSettings = ref(new DesktopSettings());

  const startButtonIcon = computed(() => {
    const settings = desktopSettings.value;
    if (!settings.startButtonIconPerTheme) return settings.startButtonIcon;
    const icon = isDarkTheme.value ? settings.startButtonIconDark : settings.startButtonIconLight;
    return icon ?? settings.startButtonIcon;
  });

  const customWallpaperImage = computed(() => {
    const settings = desktopSettings.value;
    if (!settings.wallpaperImagePerTheme) return settings.wallpaperImage;
    const image = isDarkTheme.value ? settings.wallpaperImageDark : settings.wallpaperImageLight;
    return image ?? settings.wallpaperImage;
  });

  const wallpaperStyle = computed<CSSProperties>(() => {
    const settings = desktopSettings.value;
    const image =
      settings.wallpaperMode === "image" ? customWallpaperImage.value : backgroundImageUrl.value;
    if (!image) {
      // Match the active theme while waiting for the desktop stylesheet to load.
      const fallback = isDarkTheme.value ? "#232429" : "#f5f5f5";
      return { backgroundColor: `var(--desktop-bg-color, ${fallback})` };
    }
    const overlay = isDarkTheme.value ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.2)";
    const blur = settings.wallpaperBlurFollowConsole
      ? backgroundImageBlur.value
      : settings.wallpaperBlur;
    return {
      backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${JSON.stringify(image)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      filter: `blur(${blur}px)`,
      inset: `${-3 * blur}px`
    };
  });

  let appearanceRequest = 0;
  const loadDesktopAppearance = async () => {
    const request = ++appearanceRequest;
    const [settingsResult, appearanceResult] = await Promise.allSettled([
      getDesktopSettings().execute(),
      getAppearance().execute()
    ]);
    if (request !== appearanceRequest) return;
    if (settingsResult.status === "fulfilled") {
      desktopSettings.value = normalizeDesktopSettings(settingsResult.value.value);
    }
    if (appearanceResult.status === "fulfilled") {
      appearance.value = appearanceResult.value.value;
      const blur = appearanceResult.value.value?.backgroundImageBlur ?? 5;
      backgroundImageBlur.value = Number.isFinite(blur) ? Math.min(50, Math.max(0, blur)) : 5;
    }
  };

  const onPluginSettingsChanged = (event: Event) => {
    const id = (event as CustomEvent<{ id: string }>).detail?.id;
    if (id === "desktop" || id === "console") void loadDesktopAppearance();
  };

  onMounted(() => {
    window.addEventListener("elementspanel:plugin-settings-changed", onPluginSettingsChanged);
    void loadDesktopAppearance();
  });
  onUnmounted(() => {
    appearanceRequest++;
    window.removeEventListener("elementspanel:plugin-settings-changed", onPluginSettingsChanged);
  });

  return {
    isDarkTheme,
    appearance,
    backgroundImageUrl,
    backgroundImageBlur,
    desktopSettings,
    startButtonIcon,
    customWallpaperImage,
    wallpaperStyle,
    loadDesktopAppearance,
    onPluginSettingsChanged
  };
}
