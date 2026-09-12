import { notification } from "@/tools/vuetifyToast";

// Desktop presentation uses the shell's notification API without importing the
// optional desktop plugin. The plugin's dialogs resolve ctx.desktop.window.
export function notifyDesktop(
  message: string,
  type: "success" | "error" | "warning" | "info" = "info"
) {
  if (message) notification[type]({ message, placement: "top" });
}
