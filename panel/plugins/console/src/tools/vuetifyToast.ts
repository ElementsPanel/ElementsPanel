import { createApp, defineComponent, h, isVNode, shallowReactive, type VNode } from "vue";
import { VIcon, VSnackbar } from "vuetify/components";
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
  type: ToastType;
  content: Renderable;
  description?: Renderable;
  timeout: number;
  location: string;
  visible: boolean;
  closing: boolean;
  removeTimer?: ReturnType<typeof setTimeout>;
}

const activeToasts = shallowReactive<ToastItem[]>([]);
let nextId = 1;
let mounted = false;
let host: HTMLDivElement | undefined;
let app: ReturnType<typeof createApp> | undefined;

const typeColor: Record<ToastType, string> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info"
};

const typeIcon: Record<ToastType, string> = {
  success: "mdi-check-circle-outline",
  error: "mdi-alert-circle-outline",
  warning: "mdi-alert-outline",
  info: "mdi-information-outline"
};

// Toasts share one position regardless of the legacy placement supplied by a caller.
const resolveToastLocation = (_placement?: string) => "top";

const finalizeToast = (item: ToastItem) => {
  if (item.removeTimer) {
    clearTimeout(item.removeTimer);
    item.removeTimer = undefined;
  }
  const index = activeToasts.indexOf(item);
  if (index >= 0) activeToasts.splice(index, 1);
  if (activeToasts.length === 0) {
    app?.unmount();
    host?.remove();
    app = undefined;
    host = undefined;
    mounted = false;
  }
};

const removeToast = (item: ToastItem) => {
  if (item.closing || activeToasts.indexOf(item) < 0) return;
  item.closing = true;
  item.visible = false;

  // Keep the item mounted long enough for VSnackbar's leave transition. The
  // after-leave hook normally removes it sooner; this also covers a close
  // call made before the first render has completed.
  item.removeTimer = setTimeout(() => finalizeToast(item), 250);
};

const resolveRenderable = (value: Renderable): Renderable =>
  typeof value === "function" ? resolveRenderable(value()) : value;

const ensureMounted = () => {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  host = document.createElement("div");
  host.className = "vuetify-toast-host";
  document.body.appendChild(host);

  const ToastHost = defineComponent({
    setup() {
      return () =>
        [...activeToasts].reverse().map((item, index) => {
          const content = resolveRenderable(item.content);
          const description = resolveRenderable(item.description);
          const stackOffset = `${16 + index * 64}px`;
          const textChildren: any[] = [];
          if (content != null) textChildren.push(...(Array.isArray(content) ? content : [content]));
          if (description != null) {
            textChildren.push(
              (h as any)("div", { class: "vuetify-toast-description" },
                Array.isArray(description) ? description : [description]
              )
            );
          }

          const children = (h as any)("div", { class: "vuetify-toast-content" }, [
            (h as any)(VIcon, {
              icon: typeIcon[item.type],
              class: "vuetify-toast-icon mr-4",
              size: 20
            }),
            (h as any)("div", { class: "vuetify-toast-text" }, textChildren)
          ]);

          return (h as any)(
            VSnackbar,
            {
              key: item.id,
              class: "vuetify-toast",
              modelValue: item.visible,
              "onUpdate:modelValue": (value: boolean) => {
                if (!value) removeToast(item);
              },
              onAfterLeave: () => finalizeToast(item),
              color: typeColor[item.type],
              location: item.location,
              contentProps: {
                style: {
                  marginTop: stackOffset
                }
              },
              rounded: "xl",
              timeout: item.timeout,
              variant: "tonal",
              multiLine: description != null
            },
            { default: () => children }
          );
        });
    }
  });

  app = createApp(ToastHost);
  installVuetify(app);
  app.mount(host);
};

const openToast = (type: ToastType, options: ToastOptions | Renderable) => {
  ensureMounted();
  if (!mounted) return { close: () => undefined };

  const normalized: ToastOptions =
    typeof options === "object" && options !== null && !Array.isArray(options) && !isVNode(options)
      ? (options as ToastOptions)
      : { content: options as Renderable };
  const content = normalized.message ?? normalized.content;
  const item = shallowReactive<ToastItem>({
    id: nextId++,
    type,
    content,
    description: normalized.description,
    timeout: normalized.duration === 0 ? -1 : normalized.duration ?? 3200,
    location: resolveToastLocation(normalized.placement),
    visible: true,
    closing: false
  });
  activeToasts.push(item);

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
  activeToasts.forEach((item) => {
    if (item.removeTimer) clearTimeout(item.removeTimer);
  });
  activeToasts.splice(0, activeToasts.length);
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mounted = false;
};
