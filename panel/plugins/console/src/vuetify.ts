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
          primary: "#1677ff",
          error: "#f5222d",
          info: "#8c8c8c"
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: "#3c89e8",
          error: "#e84749",
          info: "#8c8c8c"
        }
      }
    }
  }
});

const installedApps = new WeakSet<App>();

/** Install once per Vue app, including when the console plugin is reloaded. */
export function installVuetify(app: App) {
  if (installedApps.has(app)) return;
  app.use(vuetify);
  installedApps.add(app);
}
