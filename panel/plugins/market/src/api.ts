import { useDefineApi } from "@/stores/useDefineApi";
import type { QuickStartTemplate } from "@/types";

// Every HTTP call the market makes. The panel core keeps none of these, so
// removing this plugin removes the market API surface with it.

export interface MarketSettings {
  /** Where the package catalogue is fetched from: a URL, or an uploaded file. */
  presetPackAddr: string;
  /** Whether non-elevated users may install packages. */
  allowUsePreset: boolean;
}

/** The package catalogue, resolved and cached by the plugin backend. */
export const quickInstallListAddr = useDefineApi<any, QuickStartTemplate>({
  url: "/api/market/packages",
  method: "GET"
});

/** Reinstall an existing instance from a catalogue package. */
export const reinstallInstance = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: {
      targetUrl?: string;
      title: string;
      description: string;
    };
  },
  boolean
>({
  url: "/api/market/install_instance",
  method: "POST"
});

/**
 * The subset of the settings any signed-in user may read: the terminal button
 * has to know whether this user is allowed to install packages at all.
 */
export const marketPublicConfig = useDefineApi<any, { allowUsePreset: boolean }>({
  url: "/api/market/config",
  method: "GET"
});

/**
 * Points the catalogue at a freshly uploaded template. The rest of the market's
 * settings are declared by its backend and edited on the plugin manager page.
 */
export const updateMarketSettings = useDefineApi<{ data: Partial<MarketSettings> }, boolean>({
  url: "/api/market/settings",
  method: "PUT"
});
