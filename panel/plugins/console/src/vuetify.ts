import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";

import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/lib/iconsets/mdi.mjs";
import type { App } from "vue";

/**
 * Vuetify is installed by the console plugin so feature plugins can use the
 * same component and theme context without putting UI code back in the host.
 */
export const vuetify = createVuetify({
  defaults: {
    VDialog: {
      scrim: "rgba(0, 0, 0, 0.48)",
      scrollable: true
    },
    VCard: {
      rounded: "xl"
    },
    VAutocomplete: { flat: true, rounded: "xl" },
    VBtn: { flat: true, rounded: "xl" },
    VCombobox: { flat: true, rounded: "xl" },
    VField: { flat: true, rounded: "xl" },
    VFileInput: { flat: true, rounded: "xl" },
    VSelect: { flat: true, rounded: "xl" },
    VTextarea: { flat: true, rounded: "xl" },
    VTextField: { flat: true, rounded: "xl" }
  },
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: { mdi }
  },
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        dark: false,
        colors: {
          background: "#f5f5f5",
          surface: "#ffffff",
          "surface-variant": "#f0f0f0",
          "on-background": "#262626",
          "on-surface": "#262626",
          "on-surface-variant": "#262626",
          primary: "#1677ff",
          error: "#f5222d",
          info: "#8c8c8c"
        }
      },
      dark: {
        dark: true,
        colors: {
          background: "#232429",
          surface: "#202020",
          "surface-variant": "#303136",
          "on-background": "#bfbfbf",
          "on-surface": "#bfbfbf",
          "on-surface-variant": "#ffffff",
          primary: "#3c89e8",
          error: "#e84749",
          info: "#8c8c8c"
        }
      }
    }
  }
});

/**
 * Keep Vuetify's global theme in sync with the console theme.  This matters
 * for dialogs mounted through createApp() (for example Modal.confirm), since
 * those apps are outside ConsoleApp's VThemeProvider subtree.
 */
export function setVuetifyTheme(isDark: boolean) {
  vuetify.theme.global.name.value = isDark ? "dark" : "light";
}

const installedApps = new WeakSet<App>();

/** Install once per Vue app, including when the console plugin is reloaded. */
export function installVuetify(app: App) {
  if (installedApps.has(app)) return;
  app.use(vuetify);
  installedApps.add(app);
}
