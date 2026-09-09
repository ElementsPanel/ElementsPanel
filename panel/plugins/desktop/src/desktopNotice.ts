import { reactive } from "vue";

export type DesktopNoticeType = "success" | "error" | "warning" | "info";

export interface DesktopNoticeInput {
  message?: string;
  description?: string;
}

export const desktopNotice = reactive({
  visible: false,
  text: "",
  type: "info" as DesktopNoticeType,
  key: 0
});

export function notifyDesktop(
  input: string | DesktopNoticeInput,
  type: DesktopNoticeType = "info"
) {
  const text = typeof input === "string"
    ? input
    : [input.message, input.description].filter(Boolean).join(" ");
  if (!text) return;
  desktopNotice.text = text;
  desktopNotice.type = type;
  desktopNotice.key += 1;
  desktopNotice.visible = true;
}

export function notifyDesktopError(error: unknown, fallback = "") {
  const text = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? fallback);
  notifyDesktop(text || fallback, "error");
}
