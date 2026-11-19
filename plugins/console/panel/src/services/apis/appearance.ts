import { useDefineApi } from "@/stores/useDefineApi";

export interface PanelAppearance {
  pageTitle: string;
  logoImage: string;
  logoImageLight?: string;
  logoImageDark?: string;
  backgroundImage: string;
  backgroundImagePerTheme?: boolean;
  backgroundImageLight?: string;
  backgroundImageDark?: string;
  backgroundImageBlur?: number;
}

export function resolveBackgroundImage(
  appearance: Partial<PanelAppearance> | undefined,
  isDarkTheme: boolean
) {
  if (!appearance?.backgroundImagePerTheme) return appearance?.backgroundImage || "";
  const image = isDarkTheme ? appearance.backgroundImageDark : appearance.backgroundImageLight;
  return image ?? appearance.backgroundImage ?? "";
}

/** Public: the shell reads it before authentication is restored. */
export const getAppearance = useDefineApi<unknown, PanelAppearance>({
  url: "/api/overview/appearance",
  method: "GET"
});
