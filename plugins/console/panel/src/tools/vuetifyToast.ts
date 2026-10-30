import {
  createApp,
  defineComponent,
  h,
  isVNode,
  nextTick,
  shallowReactive,
  type VNode,
  type VNodeChild
} from "vue";
import { VSnackbarQueue } from "vuetify/components";
import { installVuetify } from "../vuetify";

type ToastType = "success" | "error" | "warning" | "info";
type Renderable = string | number | VNode | Renderable[] | (() => Renderable) | undefined;

export interface ToastOptions {
  message?: Renderable;
  description?: Renderable;
  content?: Renderable;
  type?: ToastType;
  duration?: number;
  placement?: string;
}

interface ToastItem {
  id: number;
  content: Renderable;
  description?: Renderable;
  closing: boolean;
  dismiss?: () => void;
}

interface QueueMessage {
  class: string;
  color: ToastType;
  prependIcon: string;
  timeout: number;
  contentProps: { "data-toast-id": number };
  onDismiss: () => void;
  onAfterLeave: () => void;
}

const MAX_VISIBLE = 3;
const DEFAULT_TIMEOUT = 5000;
const messages = shallowReactive<QueueMessage[]>([]);
const toasts = new Map<number, ToastItem>();
let nextId = 1;
let host: HTMLDivElement | undefined;
let app: ReturnType<typeof createApp> | undefined;

const typeIcon: Record<ToastType, string> = {
  success: "mdi-check-circle-outline",
  error: "mdi-alert-circle-outline",
  warning: "mdi-alert-outline",
  info: "mdi-information-outline"
};

const finalizeToast = (item: ToastItem) => {
  toasts.delete(item.id);
  nextTick(() => {
    if (toasts.size === 0) destroyAll();
  });
};

const removeToast = (item: ToastItem) => {
  if (item.closing || toasts.get(item.id) !== item) return;
  item.closing = true;
  const pendingIndex = messages.findIndex(
    (message) => message.contentProps["data-toast-id"] === item.id
  );
  if (pendingIndex >= 0) {
    messages.splice(pendingIndex, 1);
    finalizeToast(item);
    return;
  }

  nextTick(() => {
    if (toasts.get(item.id) === item) item.dismiss?.();
  });
};

const resolveRenderable = (value: Renderable): VNodeChild => {
  if (typeof value === "function") return resolveRenderable(value());
  if (Array.isArray(value)) return value.map(resolveRenderable);
  return value;
};

const hasContent = (value: Renderable): boolean => {
  if (typeof value === "function") return hasContent(value());
  if (Array.isArray(value)) return value.some(hasContent);
  return typeof value === "string" ? value.trim().length > 0 : value != null;
};

const ensureMounted = () => {
  if (app || typeof document === "undefined") return;
  host = document.createElement("div");
  host.className = "vuetify-toast-host";
  document.body.appendChild(host);

  const ToastHost = defineComponent({
    setup() {
      return () =>
        h(
          VSnackbarQueue<QueueMessage[]>,
          {
            modelValue: messages,
            // Keep the array stable so simultaneous dismissals see the updated queue.
            "onUpdate:modelValue": (value: QueueMessage[]) =>
              messages.splice(0, messages.length, ...value),
            attach: "body",
            location: "top center",
            minWidth: 0,
            maxWidth: "min(560px, calc(100vw - 32px))",
            zIndex: 10000,
            rounded: "xl",
            timeout: DEFAULT_TIMEOUT,
            totalVisible: MAX_VISIBLE,
            variant: "tonal"
          },
          {
            text: ({ item }: { item: QueueMessage }) => {
              const toast = toasts.get(item.contentProps["data-toast-id"]);
              if (!toast) return null;
              return h("div", { class: "vuetify-toast-text" }, [
                resolveRenderable(toast.content),
                toast.description != null
                  ? h("div", { class: "vuetify-toast-description" }, [
                      resolveRenderable(toast.description)
                    ])
                  : null
              ]);
            },
            // The queue exposes its per-message dismiss callback through this slot.
            actions: ({ item, props }: { item: QueueMessage; props: { onClick: () => void } }) => {
              const toast = toasts.get(item.contentProps["data-toast-id"]);
              if (toast) toast.dismiss = props.onClick;
              return null;
            }
          }
        );
    }
  });

  app = createApp(ToastHost);
  installVuetify(app);
  app.mount(host);
};

const openToast = (type: ToastType, options: ToastOptions | Renderable) => {
  const normalized: ToastOptions =
    typeof options === "object" && options !== null && !Array.isArray(options) && !isVNode(options)
      ? (options as ToastOptions)
      : { content: options as Renderable };
  const content = normalized.message ?? normalized.content;
  const description = normalized.description;
  if (!hasContent(content) && !hasContent(description)) return { close: () => undefined };

  ensureMounted();
  if (!app) return { close: () => undefined };

  const item: ToastItem = {
    id: nextId++,
    content: typeof content === "string" ? content.trim() : content,
    description: typeof description === "string" ? description.trim() : description,
    closing: false
  };
  toasts.set(item.id, item);
  messages.push({
    class: "vuetify-toast",
    color: type,
    prependIcon: typeIcon[type],
    timeout: normalized.duration === 0 ? -1 : normalized.duration ?? DEFAULT_TIMEOUT,
    contentProps: { "data-toast-id": item.id },
    onDismiss: () => (item.closing = true),
    onAfterLeave: () => finalizeToast(item)
  });

  return {
    close: () => {
      removeToast(item);
    }
  };
};

const createMessage = (type: ToastType) => (content: Renderable, duration?: number) =>
  openToast(type, { content, duration });

export const message = {
  success: createMessage("success"),
  error: createMessage("error"),
  warning: createMessage("warning"),
  warn: createMessage("warning"),
  info: createMessage("info")
};

export const notification = {
  success: (options: ToastOptions) => openToast("success", options),
  error: (options: ToastOptions) => openToast("error", options),
  warning: (options: ToastOptions) => openToast("warning", options),
  warn: (options: ToastOptions) => openToast("warning", options),
  info: (options: ToastOptions) => openToast("info", options),
  open: (options: ToastOptions) => openToast(options.type ?? "info", options)
};

export const destroyAll = () => {
  messages.splice(0, messages.length);
  toasts.clear();
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
};
