import { notification } from "@/tools/vuetifyToast";

export type DesktopNoticeType = "success" | "error" | "warning" | "info";

export interface DesktopNoticeInput {
  message?: string;
  description?: string;
}

export function notifyDesktop(
  input: string | DesktopNoticeInput,
  type: DesktopNoticeType = "info"
) {
  const options = typeof input === "string"
    ? { message: input }
    : { message: input.message, description: input.description };
  if (!options.message && !options.description) return;
  notification[type]({ ...options, placement: "top" });
}

export function notifyDesktopError(error: unknown, fallback = "") {
  const text = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? fallback);
  notifyDesktop(text || fallback, "error");
}
