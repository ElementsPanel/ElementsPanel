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

const placementMap: Record<string, string> = {
  top: "top",
  topLeft: "top start",
  topRight: "top end",
  bottom: "bottom",
  bottomLeft: "bottom start",
  bottomRight: "bottom end"
};

const removeToast = (item: ToastItem) => {
  item.visible = false;
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
        activeToasts.map((item, index) => {
          const content = resolveRenderable(item.content);
          const description = resolveRenderable(item.description);
          const children: any[] = [];

          children.push(
            (h as any)(VIcon, {
              icon: typeIcon[item.type],
              class: "mr-2",
              size: 20
            })
          );
          if (content != null) children.push(...(Array.isArray(content) ? content : [content]));
          if (description != null) {
            children.push(
              (h as any)("div", { class: "vuetify-toast-description" },
                Array.isArray(description) ? description : [description]
              )
            );
          }

          return (h as any)(
            VSnackbar,
            {
              key: item.id,
              modelValue: item.visible,
              "onUpdate:modelValue": (value: boolean) => {
                if (!value) removeToast(item);
              },
              color: typeColor[item.type],
              location: item.location,
              offset: 16 + index * 64,
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
  const item: ToastItem = {
    id: nextId++,
    type,
    content,
    description: normalized.description,
    timeout: normalized.duration === 0 ? -1 : normalized.duration ?? 3200,
    location: placementMap[normalized.placement ?? "bottom"] ?? normalized.placement ?? "bottom",
    visible: true
  };
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
  activeToasts.splice(0, activeToasts.length);
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mounted = false;
};
