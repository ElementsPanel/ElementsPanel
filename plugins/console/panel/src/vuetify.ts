import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";

import type { App } from "vue";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import themeColors from "./assets/theme-colors.module.scss";

const getThemeColors = (theme: "light" | "dark") => {
  const prefix = `${theme}-`;
  return Object.fromEntries(
    Object.entries(themeColors)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, value]) => [name.slice(prefix.length), value])
  );
};

/** Share one Vuetify component and theme context across feature plugins. */
export const vuetify = createVuetify({
  defaults: {
    VDialog: {
      scrollable: true
    },
    VDataTableFooter: {
      VSelect: {
        flat: true,
        rounded: "xl",
        variant: "solo-filled"
      }
    },
    VList: {
      VDivider: {
        class: "app-my-6"
      }
    },
    VCard: {
      rounded: "xl"
    },
    VAlert: {
      rounded: "xl"
    },
    VAutocomplete: {
      flat: true,
      rounded: "xl",
      variant: "solo-filled"
    },
    VBtn: {
      flat: true,
      rounded: "xl"
    },
    VColorPicker: {
      rounded: "xl"
    },
    VCombobox: {
      flat: true,
      rounded: "xl"
    },
    VField: {
      flat: true,
      rounded: "xl",
      color: "var(--text-color)",
      baseColor: "var(--text-color)"
    },
    VFileInput: {
      flat: true,
      rounded: "xl",
      variant: "solo-filled"
    },
    VSelect: {
      flat: true,
      rounded: "xl",
      variant: "solo-filled"
    },
    VSwitch: {
      color: "primary",
      inset: true,
      hideDetails: true
    },
    VTextarea: {
      flat: true,
      rounded: "xl",
      variant: "solo-filled"
    },
    VTextField: {
      flat: true,
      rounded: "xl",
      variant: "solo-filled"
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
        colors: getThemeColors("light")
      },
      dark: {
        dark: true,
        colors: getThemeColors("dark")
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
