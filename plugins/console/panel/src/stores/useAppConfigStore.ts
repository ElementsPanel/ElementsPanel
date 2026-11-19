/* eslint-disable no-unused-vars */
import logo from "@/assets/logo.svg";
import logoB from "@/assets/logo_b.svg";
import { getCurrentLang, setLanguage } from "@elementspanel/epanel-plugin-i18n";
import { AppTheme, THEME_AUTO_MIGRATED_KEY, THEME_KEY } from "@/types/const";
import { createGlobalState, useBreakpoints, useLocalStorage, usePreferredDark } from "@vueuse/core";
import {
  getAppearance,
  resolveBackgroundImage,
  type PanelAppearance
} from "@/services/apis/appearance";
import { computed, onMounted, reactive, ref, watch } from "vue";

/** Migrate the old first-visit LIGHT default to AUTO once; preserve later user selections. */
const migrateLegacyLightDefault = () => {
  try {
    if (localStorage.getItem(THEME_AUTO_MIGRATED_KEY)) return;
    localStorage.setItem(THEME_AUTO_MIGRATED_KEY, "1");
    if (Number(localStorage.getItem(THEME_KEY)) === AppTheme.LIGHT) {
      localStorage.setItem(THEME_KEY, String(AppTheme.AUTO));
    }
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): nothing to migrate.
  }
};

migrateLegacyLightDefault();

export const useAppConfigStore = createGlobalState(() => {
  const isPreferredDark = usePreferredDark();

  const appConfig = reactive({
    logoImage: "",
    logoImagePerTheme: undefined as boolean | undefined,
    logoImageLight: undefined as string | undefined,
    logoImageDark: undefined as string | undefined
  });

  const isDarkTheme = computed(() => {
    if (currentTheme.value === AppTheme.DARK) return true;
    if (currentTheme.value === AppTheme.AUTO) return isPreferredDark.value;
    return false;
  });

  const logoImage = computed(() => {
    const perTheme =
      appConfig.logoImagePerTheme ??
      (appConfig.logoImageLight !== undefined || appConfig.logoImageDark !== undefined);
    const themedLogo = isDarkTheme.value ? appConfig.logoImageDark : appConfig.logoImageLight;
    const image = perTheme ? themedLogo ?? appConfig.logoImage : appConfig.logoImage;
    return image || (isDarkTheme.value ? logo : logoB);
  });

  const currentTheme = useLocalStorage<AppTheme>(THEME_KEY, AppTheme.AUTO);

  const hasBgImage = ref(false);
  const backgroundAppearance = ref<PanelAppearance>();

  /** Desktop uses the sidebar/header layout; phones keep the compact navigation. */
  const breakpoints = useBreakpoints({ sidebar: 993 });
  const isWideEnoughForSidebar = breakpoints.greaterOrEqual("sidebar");
  const useSidebarLayout = computed(() => isWideEnoughForSidebar.value);
  const sidebarOpen = useLocalStorage("app-sidebar-open", true);
  const isSidebarOpen = computed(() => useSidebarLayout.value && sidebarOpen.value);

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
  };

  const clearBackgroundImage = () => {
    const body = document.querySelector("body");
    if (!body) return;
    body.style.removeProperty("--app-background-image");
    body.style.removeProperty("--app-background-blur");
    body.classList.remove("app-background-image");
    hasBgImage.value = false;
  };

  const setBackgroundImage = (url: string, blur = 5) => {
    if (!url) {
      clearBackgroundImage();
      return;
    }
    const body = document.querySelector("body");
    if (body) {
      const blurRadius = Number.isFinite(blur) ? Math.min(50, Math.max(0, blur)) : 5;
      body.style.setProperty("--app-background-blur", `${blurRadius}px`);
      const overlay = isDarkTheme.value ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.65)";
      body.style.setProperty(
        "--app-background-image",
        `linear-gradient(135deg, ${overlay}, ${overlay} 100%), url(${JSON.stringify(url)})`
      );
      body.classList.add("app-background-image");

      hasBgImage.value = true;
    }
  };

  const applyBackgroundImage = () => {
    setBackgroundImage(
      resolveBackgroundImage(backgroundAppearance.value, isDarkTheme.value),
      backgroundAppearance.value?.backgroundImageBlur
    );
  };

  watch(isDarkTheme, applyBackgroundImage);

  const setLight = () => {
    document.body.classList.add("app-light-theme");
    document.body.classList.remove("app-dark-theme");
  };

  const setDark = () => {
    document.body.classList.add("app-dark-theme");
    document.body.classList.remove("app-light-theme");
  };

  const resetTheme = () => (currentTheme.value = AppTheme.AUTO);

  const initAppTheme = async () => {
    if (
      isNaN(currentTheme.value) ||
      currentTheme.value < AppTheme.AUTO ||
      currentTheme.value > AppTheme.DARK
    ) {
      resetTheme();
    }
    const fn = {
      [AppTheme.AUTO]: () => (isPreferredDark.value ? setDark() : setLight()),
      [AppTheme.LIGHT]: () => setLight(),
      [AppTheme.DARK]: () => setDark()
    };
    fn[currentTheme.value]?.();

    const { value: appearance } = await getAppearance().execute();
    setLogoImages(appearance);
    backgroundAppearance.value = appearance;
    applyBackgroundImage();
  };

  const setTheme = (t: AppTheme) => {
    currentTheme.value = t;
    initAppTheme();
  };

  const changeLanguage = (lang: string) => {
    setLanguage(lang);
  };

  const getCurrentLanguage = () => {
    return getCurrentLang() ?? "en_us";
  };

  const setLogoImage = (url: string) => {
    appConfig.logoImage = url;
  };

  const setLogoImages = (appearance?: PanelAppearance) => {
    setLogoImage(appearance?.logoImage || "");
    appConfig.logoImagePerTheme = appearance?.logoImagePerTheme;
    appConfig.logoImageLight = appearance?.logoImageLight;
    appConfig.logoImageDark = appearance?.logoImageDark;
  };

  watch(isPreferredDark, () => {
    if (currentTheme.value === AppTheme.AUTO) {
      initAppTheme();
    }
  });

  onMounted(async () => {
    try {
      const { value: appearance } = await getAppearance().execute();
      setLogoImages(appearance);
      backgroundAppearance.value = appearance;
      applyBackgroundImage();
    } catch (error) {
      console.error("Failed to load appearance settings:", error);
    }
  });

  return {
    appConfig,
    logoImage,
    hasBgImage,
    useSidebarLayout,
    isSidebarOpen,
    toggleSidebar,
    setLogoImage,
    changeLanguage,
    getCurrentLanguage,
    isDarkTheme,
    initAppTheme,
    setTheme,
    clearBackgroundImage,
    setBackgroundImage,
    currentTheme
  };
});
