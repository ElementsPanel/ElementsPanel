import { notification } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";

// Use shell notifications without importing the optional desktop implementation.
export function notifyDesktop(
  message: string,
  type: "success" | "error" | "warning" | "info" = "info"
) {
  if (message) notification[type]({ message, placement: "top" });
}
