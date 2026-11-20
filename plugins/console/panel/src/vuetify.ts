import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";

import type { App } from "vue";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";

/** Share one Vuetify component and theme context across feature plugins. */
export const vuetify = createVuetify({
  defaults: {
    VDialog: {
      scrollable: true
    },
    VDataTableFooter: {
      VSelect: { flat: true, rounded: "xl", variant: "solo-filled" }
    },
    VList: {
      VDivider: { class: "my-6" }
    },
    VCard: {
      rounded: "xl"
    },
    VAlert: {
      rounded: "xl"
    },
    VAutocomplete: {
      flat: true, rounded: "xl", variant: "solo-filled"
    },
    VBtn: {
      flat: true, rounded: "xl"
    },
    VColorPicker: {
      rounded: "xl"
    },
    VCombobox: {
      flat: true, rounded: "xl"
    },
    VField: {
      flat: true,
      rounded: "xl",
      color: "var(--text-color)",
      baseColor: "var(--text-color)"
    },
    VFileInput: {
      flat: true, rounded: "xl", variant: "solo-filled"
    },
    VSelect: {
      flat: true, rounded: "xl", variant: "solo-filled"
    },
    VSwitch: {
      color: "primary", inset: true, hideDetails: true
    },
    VTextarea: {
      flat: true, rounded: "xl", variant: "solo-filled"
    },
    VTextField: {
      flat: true, rounded: "xl", variant: "solo-filled"
    }
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
          "field-surface": "#e8e8e8",
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
          "field-surface": "#202020",
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

/** Synchronize the global theme for dialogs mounted with separate Vue apps. */
export function setVuetifyTheme(isDark: boolean) {
  return vuetify.theme.change(isDark ? "dark" : "light");
}

const installedApps = new WeakSet<App>();

/** Install once per Vue app, including when the console plugin is reloaded. */
export function installVuetify(app: App) {
  if (installedApps.has(app)) return;
  app.use(vuetify);
  installedApps.add(app);
}
